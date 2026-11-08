import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Project, Team } from '../../../shared/schemas/projects';
import { api, ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { agentsKey, useAgents } from '../agents/api';
import { providerName } from '../providers/api';
import { roleLabels } from '../agents/api';
import { projectKey, projectsKey, teamKey, useTeam } from './api';

const roleNames = {
  business_analyst: 'Business Analyst',
  developer: 'Developer',
  qa: 'QA',
} as const;

export function TeamRoster({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const team = useTeam(projectId);
  const agents = useAgents();
  const [chosen, setChosen] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [replace, setReplace] = useState<{
    agentId: string;
    agentName: string;
    currentName: string;
  } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState<Project | null>(null);

  const members = team.data?.members ?? [];
  const available = (agents.data ?? []).filter(
    (a) => !members.some((m) => m.id === a.id),
  );

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: teamKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectsKey }),
      queryClient.invalidateQueries({ queryKey: agentsKey }),
    ]);
  }

  async function add() {
    if (!chosen) return;
    setError(null);
    setFinished(null);
    setAdding(true);
    try {
      await api<Team>(`/api/projects/${projectId}/team/${chosen}`, {
        method: 'PUT',
      });
      await refreshAll();
      announce('Added to the team.');
      setChosen(undefined);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === 'pm_already_assigned'
      ) {
        const manager = failure.details?.['projectManager'] as
          { name?: string } | undefined;
        setReplace({
          agentId: chosen,
          agentName:
            agents.data?.find((a) => a.id === chosen)?.name ?? 'this agent',
          currentName: manager?.name ?? 'the current Project Manager',
        });
      } else setError(errorMessage(failure));
    } finally {
      setAdding(false);
    }
  }

  async function swap() {
    if (!replace) return;
    setReplacing(true);
    try {
      await api<Team>(
        `/api/projects/${projectId}/team/replace-project-manager`,
        {
          method: 'POST',
          body: { agentId: replace.agentId },
        },
      );
      await refreshAll();
      announce(`${replace.agentName} is now the Project Manager.`);
      setReplace(null);
      setChosen(undefined);
    } catch (failure) {
      setReplace(null);
      setError(errorMessage(failure));
    } finally {
      setReplacing(false);
    }
  }

  async function remove(agentId: string, name: string) {
    setError(null);
    setFinished(null);
    try {
      await api<Team>(`/api/projects/${projectId}/team/${agentId}`, {
        method: 'DELETE',
      });
      await refreshAll();
      announce(`Removed ${name} from the team.`);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  async function finish() {
    setError(null);
    setFinishing(true);
    try {
      const project = await api<Project>(
        `/api/projects/${projectId}/finalize-team`,
        { method: 'POST' },
      );
      setFinished(project);
      announce(
        project.readiness === 'ready'
          ? 'Setup finished. The project is Ready.'
          : 'The team has a Project Manager, but the project is not ready yet.',
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <section aria-labelledby="team-heading" className="flex flex-col gap-3">
      <h2 id="team-heading">Team</h2>
      <p className="text-sm text-muted">
        Every team needs exactly one Project Manager: they read each ticket and
        hand it to the next agent. One agent can serve on several projects.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {error}
        </p>
      )}
      {finished && (
        <p
          role="status"
          className="rounded-lg border border-edge-soft bg-surface p-3"
        >
          {finished.readiness === 'ready'
            ? 'Setup finished. This project is Ready.'
            : 'The team has a Project Manager. The project is not Ready yet: see the reasons above.'}
        </p>
      )}
      <DataState
        what="the team"
        isLoading={team.isPending}
        error={team.error}
        isEmpty={false}
        empty={null}
        onRetry={() => void team.refetch()}
      >
        {team.data && (
          <>
            {team.data.missingRoleWarnings.length > 0 && (
              <p
                role="note"
                className="rounded-lg border border-warning bg-warning-soft p-3 text-sm text-warning"
              >
                No{' '}
                {team.data.missingRoleWarnings
                  .map((role) => roleNames[role])
                  .join(', ')}{' '}
                on this team yet. You can still finish setup.
              </p>
            )}
            {members.length === 0 ? (
              <p>No one is on this team yet. Add an agent below.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge-soft bg-surface p-3"
                  >
                    <div className="flex flex-col text-sm">
                      <Link
                        to="/agents/$agentId"
                        params={{ agentId: member.id }}
                        className="font-medium underline"
                      >
                        {member.name}
                      </Link>
                      <span className="text-muted">
                        {roleLabels[member.role]} ·{' '}
                        {providerName[member.provider]} · {member.model}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={member.readiness} />
                      <Button
                        onClick={() => void remove(member.id, member.name)}
                      >
                        Remove<span className="sr-only"> {member.name}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DataState>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Select
            label="Add an agent"
            value={chosen}
            onValueChange={setChosen}
            options={available.map((a) => ({
              value: a.id,
              label: `${a.name} (${roleLabels[a.role]})`,
            }))}
            placeholder={
              available.length === 0 ? 'No other agents' : 'Choose an agent'
            }
          />
        </div>
        <Button
          variant="primary"
          busy={adding}
          disabled={!chosen}
          onClick={() => void add()}
        >
          Add to team
        </Button>
      </div>
      {agents.isSuccess && (agents.data ?? []).length === 0 && (
        <p className="text-sm">
          There are no agents yet.{' '}
          <Link
            to="/agents/$agentId"
            params={{ agentId: 'new' }}
            className="underline"
          >
            Create an agent
          </Link>
        </p>
      )}
      <div>
        <Button busy={finishing} onClick={() => void finish()}>
          Finish setup
        </Button>
      </div>
      <ConfirmDialog
        open={replace !== null}
        onOpenChange={(open) => !open && setReplace(null)}
        title="Replace the Project Manager?"
        description={`${replace?.currentName ?? 'The current Project Manager'} is already the Project Manager. A team has exactly one.`}
        confirmLabel="Replace Project Manager"
        busy={replacing}
        onConfirm={() => void swap()}
      >
        <p>
          {replace?.agentName} will become the Project Manager and{' '}
          {replace?.currentName} will be removed from this team.
        </p>
      </ConfirmDialog>
    </section>
  );
}
