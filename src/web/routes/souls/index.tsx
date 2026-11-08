import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Soul } from '../../../shared/schemas/souls';
import { api, ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import {
  roleLabels,
  roleOrder,
  soulsKey,
  useSouls,
} from '../../features/souls/api';

function SoulCard({
  soul,
  onCopy,
  onDelete,
  busy,
}: {
  soul: Soul;
  onCopy: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <li className="resource-card flex flex-col gap-2 rounded-lg border border-edge-soft bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-all text-lg font-semibold">{soul.name}</h3>
        {soul.isDefault && (
          <span className="rounded-full bg-surface-strong px-2 py-0.5 text-sm">
            Default
          </span>
        )}
      </div>
      {soul.description && <p className="text-sm">{soul.description}</p>}
      {soul.usedByAgents.length > 0 && (
        <p className="text-sm text-muted">
          Used by {soul.usedByAgents.map((a) => a.name).join(', ')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/souls/$soulId"
          params={{ soulId: soul.id }}
          className="inline-flex min-h-11 items-center rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
        >
          {soul.isDefault ? 'View' : 'Edit'}
          <span className="sr-only"> {soul.name}</span>
        </Link>
        <Button onClick={onCopy} busy={busy}>
          Copy<span className="sr-only"> {soul.name}</span>
        </Button>
        {!soul.isDefault && (
          <Button variant="danger" onClick={onDelete}>
            Delete<span className="sr-only"> {soul.name}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

export function SoulsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const query = useSouls();
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Soul | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [removing, setRemoving] = useState(false);
  const souls = query.data ?? [];

  async function copy(soul: Soul) {
    setError(null);
    setCopying(soul.id);
    try {
      const created = await api<Soul>(`/api/souls/${soul.id}/copy`, {
        method: 'POST',
        body: {},
      });
      await queryClient.invalidateQueries({ queryKey: soulsKey });
      announce(`Created ${created.name}.`);
      await navigate({ to: '/souls/$soulId', params: { soulId: created.id } });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setCopying(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api(`/api/souls/${deleting.id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: soulsKey });
      announce(`Deleted ${deleting.name}.`);
      setDeleting(null);
    } catch (failure) {
      const agents =
        failure instanceof ApiError && failure.code === 'soul_in_use'
          ? ((failure.details?.['agents'] as { id: string; name: string }[]) ??
            [])
          : [];
      setBlockedBy(agents);
      setDeleting(null);
      setError(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Souls</h1>
        <Link
          to="/souls/$soulId"
          params={{ soulId: 'new' }}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-primary-fg hover:opacity-90"
        >
          New soul
        </Link>
      </div>
      <p className="text-muted">
        A soul is a role an agent plays: how it works and what it cares about.
        The four default souls are read-only; copy one to customize it.
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          <p>{error}</p>
          {blockedBy.length > 0 && (
            <ul className="list-disc pl-6">
              {blockedBy.map((agent) => (
                <li key={agent.id}>{agent.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DataState
        what="souls"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={souls.length === 0}
        empty={<p>No souls yet.</p>}
        onRetry={() => void query.refetch()}
      >
        {roleOrder.map((role) => {
          const group = souls.filter((s) => s.roleType === role);
          if (group.length === 0) return null;
          return (
            <section
              key={role}
              aria-labelledby={`role-${role}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`role-${role}`}>{roleLabels[role]}</h2>
              <ul className="resource-grid m-0 list-none p-0">
                {group.map((soul) => (
                  <SoulCard
                    key={soul.id}
                    soul={soul}
                    busy={copying === soul.id}
                    onCopy={() => void copy(soul)}
                    onDelete={() => {
                      setError(null);
                      setBlockedBy([]);
                      setDeleting(soul);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </DataState>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this soul'}?`}
        description="The soul is removed for good. Agents cannot use it any more."
        confirmLabel="Delete soul"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
