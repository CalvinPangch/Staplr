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
import { Card, CardRow } from '../../components/ui/Card';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { agentsKey, useAgents } from '../../features/agents/api';
import { providerName } from '../../features/providers/api';
import { roleLabels } from '../../features/agents/api';

function AgentCard({
  agent,
  onDelete,
}: {
  agent: Agent;
  onDelete: () => void;
}) {
  return (
    <Card as="li">
      <CardRow
        title={agent.name}
        href={`/agents/${agent.id}`}
        details={
          <>
            {roleLabels[agent.role]} · {providerName[agent.provider]} ·{' '}
            <span className="break-all">{agent.model ?? 'No model yet'}</span>
            <br />
            {agent.projects.length > 0
              ? `On ${agent.projects.map((p) => p.name).join(', ')}`
              : 'Not on a project yet'}
          </>
        }
        status={<StatusBadge status={agent.readiness} />}
        reason={agent.reasons.map((reason) => reason.message).join(' ')}
        actions={
          <>
            <Link
              to="/agents/$agentId"
              params={{ agentId: agent.id }}
              className="inline-flex min-h-11 items-center rounded-control border border-control bg-surface px-4 font-semibold text-fg hover:bg-bg"
            >
              Edit<span className="sr-only"> {agent.name}</span>
            </Link>
            <Button variant="destructive" onClick={onDelete}>
              Delete<span className="sr-only"> {agent.name}</span>
            </Button>
          </>
        }
      />
    </Card>
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
    <>
      <PageHeader
        title="Agents"
        description="Each agent is one Markdown file: its role, model and working instructions."
        action={
          <Link
            to="/agents/$agentId"
            params={{ agentId: 'new' }}
            data-variant="primary"
            className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-semibold text-accent-fg hover:opacity-90"
          >
            New agent
          </Link>
        }
      />
      <PageBody>
        {error && (
          <div
            role="alert"
            className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-status-failed"
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
            <>
              <p>
                No agents yet. Connect a provider, then create an agent from one
                of the role templates.
              </p>
              <Link
                to="/agents/$agentId"
                params={{ agentId: 'new' }}
                className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-semibold text-accent-fg hover:opacity-90"
              >
                Create your first agent
              </Link>
            </>
          }
          onRetry={() => void query.refetch()}
        >
          <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
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
      </PageBody>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this agent'}?`}
        description="The agent and its file are removed. Its provider connection is not affected."
        confirmLabel="Delete agent"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      />
    </>
  );
}
