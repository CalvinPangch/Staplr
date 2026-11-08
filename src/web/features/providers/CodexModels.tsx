import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ModelAccess,
  ProviderConnection,
} from '../../../shared/schemas/providers';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { formatTime } from '../source-control/api';
import { fetchModels, modelStatusText, modelsKey } from '../agents/api';
import { providersKey } from './api';
import { ModelPrice } from '../prices/ModelPrice';

const summary = (models: ModelAccess[]) =>
  new Map(models.map((m) => [m.id, m.availability]));

/** How many models were added, removed or changed availability. */
function changedCount(
  before: Map<string, string>,
  after: Map<string, string>,
): number {
  let changed = 0;
  for (const [id, availability] of after)
    if (before.get(id) !== availability) changed++;
  for (const id of before.keys()) if (!after.has(id)) changed++;
  return changed;
}

/**
 * What model discovery found for a Codex login (feature 002, US1 and US3):
 * the status line, an expandable list of models and "Refresh models".
 */
export function CodexModels({
  connection,
}: {
  connection: ProviderConnection;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = connection.discoveryStatus;
  const models = useQuery({
    queryKey: [...modelsKey(connection.id), connection.modelsRefreshedAt],
    queryFn: () => fetchModels(connection.id),
    enabled: status === 'finished' || status === 'failed' || open,
  });
  const list = models.data?.models ?? [];
  const available = models.data
    ? list.filter((m) => m.availability === 'available').length
    : null;

  let text: string | null = null;
  if (status === 'running') text = 'Discovering models…';
  else if (status === 'failed') text = connection.discoveryError;
  else if (status === 'finished' && available !== null)
    text =
      available === 0
        ? 'This account has no Codex models available'
        : `${available} ${available === 1 ? 'model' : 'models'} available`;

  // Announce the answer once, after the model count has loaded.
  const last = useRef(status);
  const before = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (last.current === 'running' && status !== 'running' && text) {
      const changes =
        before.current && models.data
          ? changedCount(before.current, summary(models.data.models))
          : null;
      announce(
        changes === null
          ? `${connection.name}: ${text}`
          : `${connection.name}: models refreshed, ${changes} ${changes === 1 ? 'change' : 'changes'}. ${text}`,
      );
      before.current = null;
    }
    if (status === 'running' || text !== null) last.current = status;
  }, [status, text, announce, connection.name, models.data]);

  async function refresh() {
    setError(null);
    setRefreshing(true);
    before.current = models.data ? summary(models.data.models) : null;
    try {
      const updated = await api<ProviderConnection>(
        `/api/provider-connections/${connection.id}/discover`,
        { method: 'POST' },
      );
      queryClient.setQueryData<ProviderConnection[]>(providersKey, (all) =>
        all?.map((c) => (c.id === updated.id ? updated : c)),
      );
    } catch (failure) {
      before.current = null;
      setError(errorMessage(failure));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {status !== 'not_started' && text && (
        <p
          className={
            status === 'failed'
              ? 'rounded-card border border-status-attention bg-status-attention-soft p-4 text-secondary text-status-attention'
              : 'text-secondary'
          }
        >
          {text}
        </p>
      )}
      <p className="text-secondary text-muted">
        Models last refreshed:{' '}
        {connection.modelsRefreshedAt ? (
          <time dateTime={connection.modelsRefreshedAt}>
            {formatTime(connection.modelsRefreshedAt)}
          </time>
        ) : (
          'Never'
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-secondary text-status-failed"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide models' : 'Show models'}
        </Button>
        <Button
          busy={refreshing || status === 'running'}
          disabled={connection.status === 'needs_relogin'}
          onClick={() => void refresh()}
        >
          Refresh models
        </Button>
      </div>
      <div id={listId} hidden={!open}>
        {open && (
          <DataState
            what="the models for this connection"
            isLoading={models.isPending}
            error={models.error}
            isEmpty={list.length === 0}
            empty={
              <p>
                No models found yet. Use Refresh models to find the models this
                login can use.
              </p>
            }
            onRetry={() => void models.refetch()}
          >
            <ul
              aria-label={`Models for ${connection.name}`}
              className="m-0 flex list-none flex-col gap-1 p-0 text-secondary"
            >
              {list.map((model) => (
                <li
                  key={model.id}
                  className="flex flex-wrap justify-between gap-x-4 rounded border border-separator px-3 py-2"
                >
                  <span className="font-medium">{model.label}</span>
                  <span
                    className={
                      model.availability === 'available' ? '' : 'text-muted'
                    }
                  >
                    {modelStatusText(model)}
                  </span>
                  <span className="basis-full">
                    <ModelPrice price={model.price} />
                  </span>
                </li>
              ))}
            </ul>
          </DataState>
        )}
      </div>
    </div>
  );
}
