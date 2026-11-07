import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Agent } from '../../../shared/schemas/agents';
import { api, ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { agentsKey, useAgents } from '../../features/agents/api';
import { providerName } from '../../features/providers/api';
import { roleLabels } from '../../features/souls/api';

function AgentCard({
  agent,
  onDelete,
}: {
  agent: Agent;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-edge-soft bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-all text-lg font-semibold">{agent.name}</h2>
        <StatusBadge status={agent.readiness} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Role</dt>
        <dd>{roleLabels[agent.role]}</dd>
        <dt className="text-muted">Provider</dt>
        <dd>{providerName[agent.provider]}</dd>
        <dt className="text-muted">Model</dt>
        <dd className="break-all">{agent.model}</dd>
        <dt className="text-muted">Projects</dt>
        <dd>
          {agent.projects.length > 0
            ? agent.projects.map((p) => p.name).join(', ')
            : 'None yet'}
        </dd>
      </dl>
      {agent.reasons.length > 0 && (
        <ul className="m-0 list-disc pl-6 text-sm">
          {agent.reasons.map((reason) => (
            <li key={reason.code}>{reason.message}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          className="inline-flex min-h-11 items-center rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
        >
          Edit<span className="sr-only"> {agent.name}</span>
        </Link>
        <Button variant="danger" onClick={onDelete}>
          Delete<span className="sr-only"> {agent.name}</span>
        </Button>
      </div>
    </li>
  );
}

export function AgentsPage() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const query = useAgents();
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [removing, setRemoving] = useState(false);
  const agents = query.data ?? [];

  async function remove() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api(`/api/agents/${deleting.id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: agentsKey });
      announce(`Deleted ${deleting.name}.`);
      setDeleting(null);
    } catch (failure) {
      setBlockedBy(
        failure instanceof ApiError && failure.code === 'agent_in_use'
          ? ((failure.details?.['projects'] as {
              id: string;
              name: string;
            }[]) ?? [])
          : [],
      );
      setDeleting(null);
      setError(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Agents</h1>
        <Link
          to="/agents/$agentId"
          params={{ agentId: 'new' }}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-primary-fg hover:opacity-90"
        >
          New agent
        </Link>
      </div>
      <p className="text-muted">
        An agent is a soul (its role) running on a provider connection with a
        model you choose. Only models verified for that exact connection can be
        picked.
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          <p>{error}</p>
          {blockedBy.length > 0 && (
            <ul className="list-disc pl-6">
              {blockedBy.map((project) => (
                <li key={project.id}>{project.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DataState
        what="agents"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={agents.length === 0}
        empty={
          <p>
            No agents yet. Connect a provider, then create an agent to give a
            soul a model to run on.
          </p>
        }
        onRetry={() => void query.refetch()}
      >
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onDelete={() => {
                setError(null);
                setBlockedBy([]);
                setDeleting(agent);
              }}
            />
          ))}
        </ul>
      </DataState>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this agent'}?`}
        description="The agent is removed. Its souls and provider connection are not affected."
        confirmLabel="Delete agent"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
