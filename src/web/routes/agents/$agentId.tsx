import { useEffect, useRef, useState } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import {
  headerValue,
  instructionsOf,
  maxAgentFileLength,
  replaceInstructions,
  setHeaderValue,
  type FileProblem,
} from '../../../shared/agent-file';
import type { Agent, AgentTemplate } from '../../../shared/schemas/agents';
import type { ModelAccess } from '../../../shared/schemas/providers';
import { api, ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextArea } from '../../components/ui/TextArea';
import {
  agentsKey,
  availabilityText,
  fetchModels,
  modelStatusText,
  modelsKey,
  roleLabels,
  useAgentTemplates,
  useAgents,
} from '../../features/agents/api';
import { AgentFileEditor } from '../../features/agents/AgentFileEditor';
import {
  discoveryPollMs,
  providerName,
  useProviderConnections,
} from '../../features/providers/api';
import { ModelPrice } from '../../features/prices/ModelPrice';
import { formatTime } from '../../features/source-control/api';

function ModelList({
  connectionId,
  catalogRevision,
  models,
  queryClient,
}: {
  connectionId: string;
  catalogRevision: string;
  models: ModelAccess[];
  queryClient: QueryClient;
}) {
  const announce = useAnnounce();
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(model: ModelAccess) {
    setError(null);
    setChecking(model.id);
    try {
      const result = await api<ModelAccess>(
        `/api/provider-connections/${connectionId}/models/${encodeURIComponent(model.id)}/check`,
        { method: 'POST' },
      );
      await queryClient.invalidateQueries({
        queryKey: modelsKey(connectionId),
      });
      announce(`${model.label}: ${availabilityText[result.availability]}.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setChecking(null);
    }
  }

  return (
    <section aria-labelledby="models-heading" className="flex flex-col gap-2">
      <h2 id="models-heading" className="text-base">
        Models for this connection
      </h2>
      <p className="text-sm text-muted">
        Catalog {catalogRevision}. A model can only be chosen once it is
        verified for this exact connection.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {models.map((model) => (
          <li
            key={model.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge-soft bg-surface p-3"
          >
            <div className="flex flex-col text-sm">
              <span className="font-medium">{model.label}</span>
              <span className="text-muted">
                {modelStatusText(model)}
                {model.lastVerifiedAt && !model.checking && (
                  <>
                    {' · verified '}
                    <time dateTime={model.lastVerifiedAt}>
                      {formatTime(model.lastVerifiedAt)}
                    </time>
                  </>
                )}
              </span>
              <ModelPrice price={model.price} />
            </div>
            <Button
              busy={checking === model.id}
              onClick={() => void check(model)}
            >
              Check availability
              <span className="sr-only"> for {model.label}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TemplatePicker({
  onPick,
}: {
  onPick: (template: AgentTemplate) => void;
}) {
  const templates = useAgentTemplates();
  const shipped = (templates.data ?? []).filter((t) => t.kind === 'shipped');
  const kept = (templates.data ?? []).filter((t) => t.kind === 'kept');
  const group = (title: string, list: AgentTemplate[]) => (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-base">{title}</h2>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {list.map((template) => (
          <li key={template.id}>
            <Button
              className="w-full justify-start text-left"
              onClick={() => onPick(template)}
            >
              {template.label}
              <span className="ml-2 text-sm text-muted">
                {roleLabels[template.role]}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      <h1>New agent</h1>
      <p className="text-muted">
        Choose a role to start from. You get the agent's Markdown file with that
        role's instructions, ready to name and connect.
      </p>
      <DataState
        what="the role templates"
        isLoading={templates.isPending}
        error={templates.error}
        isEmpty={templates.isSuccess && templates.data.length === 0}
        empty={<p>No role templates are available. Reload the page.</p>}
        onRetry={() => void templates.refetch()}
      >
        {group('Roles', shipped)}
        {kept.length > 0 && group('Kept from your earlier souls', kept)}
      </DataState>
      <Link
        to="/agents"
        className="inline-flex min-h-11 items-center self-start rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
      >
        Cancel
      </Link>
    </div>
  );
}

function Editor({ agent, initial }: { agent: Agent | null; initial: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const connections = useProviderConnections();
  const templates = useAgentTemplates();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [revision, setRevision] = useState(agent?.revision ?? 1);
  const [serverProblems, setServerProblems] = useState<FileProblem[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const leaving = useRef(false);
  const dirty = text !== saved;

  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !leaving.current,
    enableBeforeUnload: () => dirty && !leaving.current,
    withResolver: true,
  });

  const provider =
    headerValue(text, 'provider') === 'codex' ? 'codex' : 'claude';
  const role = headerValue(text, 'role');
  const connectionName = headerValue(text, 'connection');
  const providerConnections = (connections.data ?? []).filter(
    (c) => c.provider === provider,
  );
  const connection = providerConnections.find(
    (c) => c.name.toLowerCase() === connectionName.toLowerCase(),
  );
  const connectionId = connection?.id ?? '';
  const candidates = useQuery({
    queryKey: modelsKey(connectionId),
    queryFn: () => fetchModels(connectionId),
    enabled: connectionId !== '',
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.discoveryStatus === 'running' ? discoveryPollMs : false,
  });
  // Tell screen-reader users when discovery answers, without a reload.
  const discovery = candidates.data?.discoveryStatus;
  const lastDiscovery = useRef(discovery);
  useEffect(() => {
    if (lastDiscovery.current === 'running' && discovery === 'finished')
      announce('Models for this connection are ready to choose.');
    else if (lastDiscovery.current === 'running' && discovery === 'failed')
      announce('Finding models for this connection did not finish.');
    lastDiscovery.current = discovery;
  }, [discovery, announce]);

  const edit = (next: string) => {
    setText(next);
    setServerProblems([]);
  };
  const available = (candidates.data?.models ?? []).filter(
    (m) => m.availability === 'available' && !m.checking,
  );
  const roleTemplate = (templates.data ?? []).find(
    (t) => t.kind === 'shipped' && t.role === role,
  );

  async function save() {
    setServerError(null);
    setServerProblems([]);
    setSaving(true);
    try {
      const result = agent
        ? await api<Agent>(`/api/agents/${agent.id}`, {
            method: 'PUT',
            body: { definition: text, revision },
          })
        : await api<Agent>('/api/agents', {
            method: 'POST',
            body: { definition: text },
          });
      setSaved(text);
      setRevision(result.revision);
      await queryClient.invalidateQueries({ queryKey: agentsKey });
      announce(`Saved ${result.name}.`);
      leaving.current = true;
      await navigate({ to: '/agents' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'agent_file_invalid') {
        const problems = (error.details?.problems ?? []) as FileProblem[];
        setServerProblems(problems);
        announce(error.message);
      } else if (error instanceof ApiError && error.code === 'agent_changed') {
        setStale(text);
        setServerError(error.message);
      } else setServerError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    if (!agent) return;
    const latest = await api<Agent>(`/api/agents/${agent.id}`);
    setText(latest.definition);
    setSaved(latest.definition);
    setRevision(latest.revision);
    setServerError(null);
    setServerProblems([]);
    await queryClient.invalidateQueries({ queryKey: agentsKey });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{agent ? agent.name : 'New agent'}</h1>
        {agent && <StatusBadge status={agent.readiness} />}
      </div>
      {agent && agent.reasons.length > 0 && (
        <ul
          className="m-0 list-disc rounded-lg border border-warning bg-warning-soft p-3 pl-8 text-warning"
          aria-label="Why this agent is not ready"
        >
          {agent.reasons.map((reason) => (
            <li key={reason.code}>{reason.message}</li>
          ))}
        </ul>
      )}
      {serverError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          <p>{serverError}</p>
          {stale !== null && (
            <>
              <Button className="self-start" onClick={() => void reload()}>
                Reload
              </Button>
              <TextArea
                label="Your unsaved text (copy it before or after reloading)"
                value={stale}
                maxLength={maxAgentFileLength}
                readOnly
                rows={6}
                className="font-mono text-sm"
              />
            </>
          )}
        </div>
      )}
      <form
        noValidate
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <AgentFileEditor
          value={text}
          onChange={edit}
          serverProblems={serverProblems}
        />
        <div className="flex flex-col gap-3 rounded-lg border border-edge-soft p-3">
          <p className="text-sm text-muted">
            These helpers write into the header for you.
          </p>
          <Select
            label={`Insert connection (${providerName[provider]})`}
            value={connection?.id}
            onValueChange={(id) => {
              const chosen = providerConnections.find((c) => c.id === id);
              if (chosen) edit(setHeaderValue(text, 'connection', chosen.name));
            }}
            options={providerConnections.map((c) => ({
              value: c.id,
              label:
                c.status === 'needs_relogin'
                  ? `${c.name} (needs re-login)`
                  : c.name,
            }))}
            placeholder={
              providerConnections.length === 0
                ? `No ${providerName[provider]} connection yet`
                : 'Choose a connection'
            }
          />
          {connections.isSuccess && providerConnections.length === 0 && (
            <p className="text-sm">
              {provider === 'claude'
                ? 'Claude connects with your own Anthropic API key. '
                : 'Codex connects through a sign-in sandbox. '}
              <Link to="/settings/providers" className="underline">
                Connect {providerName[provider]}
              </Link>
            </p>
          )}
          <Select
            label="Insert model"
            value={
              available.some((m) => m.id === headerValue(text, 'model'))
                ? headerValue(text, 'model')
                : undefined
            }
            onValueChange={(model) =>
              edit(setHeaderValue(text, 'model', model))
            }
            options={available.map((m) => ({ value: m.id, label: m.label }))}
            disabled={
              connectionId === '' ||
              candidates.isPending ||
              available.length === 0
            }
            placeholder={
              connectionId === ''
                ? 'Insert a connection first'
                : available.length === 0
                  ? 'No verified model yet'
                  : 'Choose a verified model'
            }
            hint="Only models verified for this connection are offered."
          />
          {roleTemplate && (
            <Button className="self-start" onClick={() => setReplacing(true)}>
              Replace instructions with the {roleLabels[roleTemplate.role]}{' '}
              template
            </Button>
          )}
        </div>
        {connectionId !== '' && (
          <DataState
            what="the models for this connection"
            isLoading={candidates.isPending}
            error={candidates.error}
            isEmpty={false}
            empty={null}
            onRetry={() => void candidates.refetch()}
          >
            {candidates.data && (
              <ModelList
                connectionId={connectionId}
                catalogRevision={candidates.data.catalogRevision}
                models={candidates.data.models}
                queryClient={queryClient}
              />
            )}
          </DataState>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" busy={saving}>
            {agent ? 'Save changes' : 'Create agent'}
          </Button>
          <Link
            to="/agents"
            className="inline-flex min-h-11 items-center rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
          >
            Cancel
          </Link>
        </div>
      </form>
      <ConfirmDialog
        open={replacing}
        onOpenChange={setReplacing}
        title="Replace the instructions?"
        description="The text below the header is replaced with the role's template. The header stays as it is. Nothing is saved until you save."
        confirmLabel="Replace instructions"
        onConfirm={() => {
          const body = roleTemplate && instructionsOf(roleTemplate.definition);
          if (body !== undefined && body !== null)
            edit(replaceInstructions(text, body));
          setReplacing(false);
        }}
      />
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Leave without saving?"
        description="Your changes to this agent's file have not been saved."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}

export function AgentEditorPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string };
  const creating = agentId === 'new';
  const query = useAgents();
  const [template, setTemplate] = useState<AgentTemplate | null>(null);
  if (creating)
    return template ? (
      <Editor key={template.id} agent={null} initial={template.definition} />
    ) : (
      <TemplatePicker onPick={setTemplate} />
    );
  const agent = query.data?.find((a) => a.id === agentId) ?? null;
  return (
    <DataState
      what="the agent"
      isLoading={query.isPending}
      error={query.error}
      isEmpty={query.isSuccess && agent === null}
      empty={<p>That agent does not exist.</p>}
      onRetry={() => void query.refetch()}
    >
      {agent && (
        <Editor key={agent.id} agent={agent} initial={agent.definition} />
      )}
    </DataState>
  );
}
