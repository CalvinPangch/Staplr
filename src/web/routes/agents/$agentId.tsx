import { useEffect, useRef, useState } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  agentInputSchema,
  type Agent,
  type AgentInput,
} from '../../../shared/schemas/agents';
import type { ModelAccess } from '../../../shared/schemas/providers';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import {
  agentsKey,
  availabilityText,
  fetchModels,
  modelStatusText,
  modelsKey,
  useAgents,
} from '../../features/agents/api';
import { discoveryPollMs } from '../../features/providers/api';
import {
  providerName,
  useProviderConnections,
} from '../../features/providers/api';
import { roleLabels, useSouls } from '../../features/souls/api';
import { formatTime } from '../../features/source-control/api';

const providerOptions = [
  { value: 'claude', label: providerName.claude },
  { value: 'codex', label: providerName.codex },
];

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

function Editor({ agent }: { agent: Agent | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const souls = useSouls();
  const connections = useProviderConnections();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AgentInput>({
    resolver: zodResolver(agentInputSchema),
    defaultValues: {
      name: agent?.name ?? '',
      soulId: agent?.soulId ?? '',
      provider: agent?.provider ?? 'claude',
      providerConnectionId: agent?.providerConnectionId ?? '',
      model: agent?.model ?? '',
    },
  });
  const provider = useWatch({ control, name: 'provider' });
  const connectionId = useWatch({ control, name: 'providerConnectionId' });
  const model = useWatch({ control, name: 'model' });
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

  const connectionOptions = (connections.data ?? [])
    .filter((c) => c.provider === provider)
    .map((c) => ({
      value: c.id,
      label:
        c.status === 'needs_relogin' ? `${c.name} (needs re-login)` : c.name,
    }));
  const soulOptions = (souls.data ?? []).map((s) => ({
    value: s.id,
    label: `${s.name} (${roleLabels[s.roleType]})`,
  }));
  const modelOptions = (candidates.data?.models ?? []).map((m) => ({
    value: m.id,
    label:
      m.availability === 'available' && !m.checking
        ? m.label
        : `${m.label} (${modelStatusText(m).toLowerCase()})`,
    disabled: m.availability !== 'available' || m.checking === true,
  }));
  const savedModelMissing =
    model !== '' &&
    candidates.data &&
    !candidates.data.models.some((m) => m.id === model);

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
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {serverError}
        </p>
      )}
      <form
        noValidate
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError(null);
          try {
            const saved = agent
              ? await api<Agent>(`/api/agents/${agent.id}`, {
                  method: 'PUT',
                  body: values,
                })
              : await api<Agent>('/api/agents', {
                  method: 'POST',
                  body: values,
                });
            await queryClient.invalidateQueries({ queryKey: agentsKey });
            announce(`Saved ${saved.name}.`);
            await navigate({ to: '/agents' });
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <Controller
          control={control}
          name="soulId"
          render={({ field }) => (
            <Select
              label="Soul"
              value={field.value === '' ? undefined : field.value}
              onValueChange={field.onChange}
              options={soulOptions}
              placeholder="Choose a soul"
              error={errors.soulId?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="provider"
          render={({ field }) => (
            <Select
              label="Provider"
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                setValue('providerConnectionId', '');
                setValue('model', '');
              }}
              options={providerOptions}
              error={errors.provider?.message}
            />
          )}
        />
        <div className="flex flex-col gap-2">
          <Controller
            control={control}
            name="providerConnectionId"
            render={({ field }) => (
              <Select
                label="Connection"
                value={field.value === '' ? undefined : field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValue('model', '');
                }}
                options={connectionOptions}
                placeholder={
                  connectionOptions.length === 0
                    ? `No ${providerName[provider]} connection yet`
                    : 'Choose a connection'
                }
                error={errors.providerConnectionId?.message}
              />
            )}
          />
          {connections.isSuccess && connectionOptions.length === 0 && (
            <p className="text-sm">
              {provider === 'claude'
                ? 'Claude connects with your own Anthropic API key. '
                : 'Codex connects through a sign-in sandbox. '}
              <Link to="/settings/providers" className="underline">
                Connect {providerName[provider]}
              </Link>
            </p>
          )}
        </div>
        <Controller
          control={control}
          name="model"
          render={({ field }) => (
            <Select
              label="Model"
              value={field.value === '' ? undefined : field.value}
              onValueChange={field.onChange}
              options={modelOptions}
              disabled={connectionId === '' || candidates.isPending}
              placeholder={
                connectionId === ''
                  ? 'Choose a connection first'
                  : 'Choose a verified model'
              }
              hint={
                savedModelMissing
                  ? 'The saved model is no longer offered. Choose another model.'
                  : 'Models that are not verified for this connection are listed but cannot be chosen.'
              }
              error={errors.model?.message}
            />
          )}
        />
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
          <Button type="submit" variant="primary" busy={isSubmitting}>
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
    </div>
  );
}

export function AgentEditorPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string };
  const creating = agentId === 'new';
  const query = useAgents();
  if (creating) return <Editor key="new" agent={null} />;
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
      {agent && <Editor key={agent.id} agent={agent} />}
    </DataState>
  );
}
