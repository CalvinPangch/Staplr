import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { Project } from '../../../shared/schemas/projects';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/DataState';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  fetchBranches,
  projectKey,
  projectsKey,
  useProject,
} from '../../features/projects/api';
import {
  RepositoryPicker,
  type PickedRepository,
} from '../../features/projects/RepositoryPicker';
import { Board } from '../../features/board/Board';
import { TeamRoster } from '../../features/projects/TeamRoster';
import { formatTime } from '../../features/source-control/api';

function RelinkDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [picked, setPicked] = useState<PickedRepository | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function relink() {
    if (!picked) return;
    setError(null);
    setBusy(true);
    try {
      await api<Project>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          relink: {
            sourceControlConnectionId: picked.connectionId,
            repoRemoteId: picked.repository.remoteId,
          },
        },
      });
      await queryClient.invalidateQueries({ queryKey: projectKey(project.id) });
      await queryClient.invalidateQueries({ queryKey: projectsKey });
      announce(
        `Relinked to ${picked.repository.fullName}. Downloading it again.`,
      );
      setPicked(null);
      onOpenChange(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPicked(null);
          setError(null);
        }
        onOpenChange(next);
      }}
      title="Relink repository"
      description="Choose the repository this project should use now. It is downloaded again; the team stays."
    >
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {error}
        </p>
      )}
      <RepositoryPicker
        onPick={setPicked}
        initialConnectionId={project.sourceControlConnectionId ?? ''}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={picked === null}
          onClick={() => void relink()}
        >
          Relink repository
        </Button>
      </div>
    </Dialog>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'retry' | 'refresh' | null>(null);
  const [relinking, setRelinking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [tab, setTab] = useState<'board' | 'setup'>('board');
  const downloaded = project.downloadStatus === 'downloaded';
  const connectionId = project.sourceControlConnectionId;

  async function refreshProject() {
    await queryClient.invalidateQueries({ queryKey: projectKey(project.id) });
    await queryClient.invalidateQueries({ queryKey: projectsKey });
  }

  async function retry() {
    setError(null);
    setBusy('retry');
    try {
      await api(`/api/projects/${project.id}/download`, { method: 'POST' });
      await refreshProject();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setError(null);
    setBusy('refresh');
    try {
      await api(`/api/projects/${project.id}/refresh`, { method: 'POST' });
      await refreshProject();
      announce('Repository refreshed.');
    } catch (failure) {
      setError(errorMessage(failure));
      await refreshProject();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: projectsKey });
      announce(`Deleted ${project.name}.`);
      await navigate({ to: '/projects' });
    } catch (failure) {
      setDeleting(false);
      setError(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  }

  async function changeBranch(baseBranch: string) {
    setError(null);
    setSwitching(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: { baseBranch },
      });
      await refreshProject();
      announce(`Base branch is now ${baseBranch}.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{project.name}</h1>
        <StatusBadge status={project.readiness} />
      </div>
      <p className="break-all text-muted">{project.repoFullName}</p>

      {project.reasons.length > 0 && (
        <section
          aria-labelledby="reasons-heading"
          className="rounded-lg border border-warning bg-warning-soft p-3 text-warning"
        >
          <h2 id="reasons-heading" className="text-base">
            Why this project is not ready
          </h2>
          <ul className="m-0 mt-1 list-disc pl-6">
            {project.reasons.map((reason, index) => (
              <li key={`${reason.code}-${reason.agentId ?? index}`}>
                {reason.message}{' '}
                {reason.code === 'source_control_needs_attention' && (
                  <Link to="/settings/source-control" className="underline">
                    Open Source control
                  </Link>
                )}
                {reason.code === 'agent_not_ready' && reason.agentId && (
                  <Link
                    to="/agents/$agentId"
                    params={{ agentId: reason.agentId }}
                    className="underline"
                  >
                    Open the agent
                  </Link>
                )}
                {reason.code === 'repository_unavailable' && (
                  <Button onClick={() => setRelinking(true)}>
                    Relink repository
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {error}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Project views"
        className="flex gap-1 border-b border-edge-soft"
      >
        {(
          [
            ['board', 'Board'],
            ['setup', 'Setup'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const next = id === 'board' ? 'setup' : 'board';
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            className={`min-h-11 rounded-t-lg border-b-2 px-4 py-2 font-medium ${
              tab === id
                ? 'border-primary text-fg'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <div id="panel-board" role="tabpanel" aria-labelledby="tab-board">
          <Board projectId={project.id} />
        </div>
      )}

      {tab === 'setup' && (
        <div
          id="panel-setup"
          role="tabpanel"
          aria-labelledby="tab-setup"
          className="flex flex-col gap-4"
        >
          <section
            aria-labelledby="repo-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="repo-heading">Repository</h2>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.downloadStatus} />
              {project.downloadStatus === 'downloading' && (
                <div className="flex min-w-48 flex-1 items-center gap-2">
                  <progress
                    className="h-3 flex-1"
                    max={100}
                    value={project.downloadProgress ?? 0}
                    aria-label="Download progress"
                  />
                  <span>{project.downloadProgress ?? 0}%</span>
                </div>
              )}
            </div>
            {project.downloadStatus === 'download_failed' && (
              <div className="flex flex-col gap-2">
                <p>{project.downloadError}</p>
                <div>
                  <Button
                    variant="primary"
                    busy={busy === 'retry'}
                    onClick={() => void retry()}
                  >
                    Retry download
                  </Button>
                </div>
              </div>
            )}
            {downloaded && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  Last updated{' '}
                  {project.lastUpdatedAt ? (
                    <time dateTime={project.lastUpdatedAt}>
                      {formatTime(project.lastUpdatedAt)}
                    </time>
                  ) : (
                    'never'
                  )}
                </p>
                <Button
                  busy={busy === 'refresh'}
                  onClick={() => void refresh()}
                >
                  Refresh
                </Button>
              </div>
            )}
            {project.lastRefreshError && (
              <p role="note" className="text-sm text-warning">
                {project.lastRefreshError}
              </p>
            )}
            <BranchPicker
              project={project}
              disabled={!connectionId || switching}
              onChange={(branch) => void changeBranch(branch)}
            />
            <div>
              <Button onClick={() => setRelinking(true)}>
                Relink repository
              </Button>
            </div>
          </section>

          <TeamRoster projectId={project.id} />

          <section
            aria-labelledby="danger-heading"
            className="flex flex-col gap-2"
          >
            <h2 id="danger-heading">Delete project</h2>
            <div>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                Delete project
              </Button>
            </div>
          </section>
        </div>
      )}

      <RelinkDialog
        project={project}
        open={relinking}
        onOpenChange={setRelinking}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${project.name}?`}
        description="This cannot be undone."
        confirmLabel="Delete project"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      >
        <div className="flex flex-col gap-2">
          <p className="font-medium">This removes:</p>
          <ul className="list-disc pl-6">
            <li>the downloaded repository and any working copies</li>
            <li>the team assignments of this project</li>
            <li>all of its tickets</li>
          </ul>
          <p className="font-medium">This keeps:</p>
          <ul className="list-disc pl-6">
            <li>your agents, souls and provider connections</li>
            <li>usage records, shown as “Deleted project”</li>
            <li>the repository on GitHub or GitLab</li>
          </ul>
        </div>
      </ConfirmDialog>
    </div>
  );
}

/** Loads the branch list when the person opens the picker, not on every visit. */
function BranchPicker({
  project,
  disabled,
  onChange,
}: {
  project: Project;
  disabled: boolean;
  onChange: (branch: string) => void;
}) {
  const connectionId = project.sourceControlConnectionId;
  const [loaded, setLoaded] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    if (loaded || !connectionId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setLoaded(await fetchBranches(connectionId, project.repoRemoteId));
    } catch (failure) {
      setLoadError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  const options = (loaded ?? [project.baseBranch]).map((branch) => ({
    value: branch,
    label: branch,
  }));
  return (
    <div className="flex flex-col gap-1" onFocusCapture={() => void load()}>
      <Select
        label="Base branch"
        value={project.baseBranch}
        onValueChange={onChange}
        options={options}
        disabled={disabled || loading}
        hint="Ticket working copies branch off this branch and pull requests target it."
        error={loadError ?? undefined}
      />
    </div>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const query = useProject(projectId);
  return (
    <DataState
      what="the project"
      isLoading={query.isPending}
      error={query.error}
      isEmpty={false}
      empty={null}
      onRetry={() => void query.refetch()}
    >
      {query.data && <ProjectDetail project={query.data} />}
    </DataState>
  );
}
