import { Card } from '../../components/ui/Card';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PriceStatus } from '../../../shared/schemas/prices';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { formatTime } from '../source-control/api';

export const priceStatusKey = ['price-status'] as const;
const fetchStatus = () => api<PriceStatus>('/api/prices/status');
const names = { claude: 'Claude', codex: 'Codex' } as const;
const pollMs = 1000;
const giveUpMs = 40_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * When prices were last read from the official pages, and "Refresh prices"
 * (FR-017, FR-018). There is no separate prices screen.
 */
export function PricesPanel() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const status = useQuery({ queryKey: priceStatusKey, queryFn: fetchStatus });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setRefreshing(true);
    const before = new Map(
      (status.data?.providers ?? []).map((p) => [p.provider, p.lastAttemptAt]),
    );
    try {
      await api('/api/prices/refresh', { method: 'POST' });
      const deadline = Date.now() + giveUpMs;
      for (;;) {
        await sleep(pollMs);
        const fresh = await queryClient.fetchQuery({
          queryKey: priceStatusKey,
          queryFn: fetchStatus,
          staleTime: 0,
        });
        if (
          fresh.providers.every(
            (p) => p.lastAttemptAt !== before.get(p.provider),
          )
        ) {
          const failed = fresh.providers.filter((p) => p.lastError);
          announce(
            failed.length === 0
              ? 'Prices refreshed from the official pages.'
              : `Prices refreshed, but ${failed.map((p) => names[p.provider]).join(' and ')} could not be read. The last prices found are kept.`,
          );
          break;
        }
        if (Date.now() > deadline) {
          setError(
            'Reading the official pricing pages is taking longer than expected. The results will appear when it finishes.',
          );
          break;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['models'] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card
      as="section"
      aria-labelledby="prices-heading"
      title="Model prices"
      titleId="prices-heading"
      className="flex flex-col gap-3"
      footer={
        <Button busy={refreshing} onClick={() => void refresh()}>
          Refresh prices
        </Button>
      }
    >
      <p className="text-secondary text-muted">
        List prices come from the official Anthropic and OpenAI pricing pages
        and are shown beside each model. They are read once a day.
      </p>
      <DataState
        what="when prices were last updated"
        isLoading={status.isPending}
        error={status.error}
        onRetry={() => void status.refetch()}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-secondary">
          {(status.data?.providers ?? []).map((p) => (
            <div key={p.provider} className="contents">
              <dt className="text-muted">
                {names[p.provider]} prices last updated
              </dt>
              <dd>
                {p.lastSuccessAt ? (
                  <time dateTime={p.lastSuccessAt}>
                    {formatTime(p.lastSuccessAt)}
                  </time>
                ) : (
                  'Not yet'
                )}
              </dd>
            </div>
          ))}
        </dl>
        {(status.data?.providers ?? [])
          .filter((p) => p.lastError)
          .map((p) => (
            <p
              key={p.provider}
              className="rounded-card border border-status-attention bg-status-attention-soft p-4 text-secondary text-status-attention"
            >
              {names[p.provider]}: {p.lastError}
            </p>
          ))}
      </DataState>
      {error && (
        <p
          role="alert"
          className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-secondary text-status-failed"
        >
          {error}
        </p>
      )}
    </Card>
  );
}
