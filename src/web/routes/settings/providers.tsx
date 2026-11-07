import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { ApiKeyDialog } from '../../features/providers/ApiKeyDialog';
import { CodexLoginDialog } from '../../features/providers/CodexLoginDialog';
import { ProviderCard } from '../../features/providers/ProviderCard';
import {
  fetchProviders,
  providersKey,
  useProviderConnections,
} from '../../features/providers/api';

const pollMs = 800;
const giveUpMs = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const query = useProviderConnections();
  const [addingClaude, setAddingClaude] = useState(false);
  const [addingCodex, setAddingCodex] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = query.data ?? [];

  async function checkAll() {
    setNotice(null);
    setCheckingAll(true);
    const before = new Map(connections.map((c) => [c.id, c.lastCheckedAt]));
    try {
      await api('/api/health/check-all', { method: 'POST' });
      const deadline = Date.now() + giveUpMs;
      for (;;) {
        await sleep(pollMs);
        const fresh = await queryClient.fetchQuery({
          queryKey: providersKey,
          queryFn: fetchProviders,
          staleTime: 0,
        });
        if (fresh.every((c) => c.lastCheckedAt !== before.get(c.id))) {
          announce('All provider connections checked.');
          break;
        }
        if (Date.now() > deadline) {
          setNotice(
            'Some connections did not finish checking. Their results will appear when the check completes, or use Check now on each one.',
          );
          break;
        }
      }
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setCheckingAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Providers</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            busy={checkingAll}
            disabled={connections.length === 0}
            onClick={() => void checkAll()}
          >
            Check all connections
          </Button>
          <Button onClick={() => setAddingCodex(true)}>Add Codex</Button>
          <Button variant="primary" onClick={() => setAddingClaude(true)}>
            Add Claude
          </Button>
        </div>
      </div>
      <p className="text-muted">
        Agents run on Claude with your own Anthropic API key, or on Codex with
        your own account. Credentials are stored encrypted and are never shown
        again. Connections are re-checked every hour.
      </p>
      {notice && (
        <p
          role="alert"
          className="rounded-lg border border-warning bg-warning-soft p-3 text-warning"
        >
          {notice}
        </p>
      )}
      <DataState
        what="provider connections"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={connections.length === 0}
        empty={
          <p>
            No provider connections yet. Add a Claude API key or sign in to
            Codex so agents have a model to run on.
          </p>
        }
        onRetry={() => void query.refetch()}
      >
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {connections.map((connection) => (
            <ProviderCard key={connection.id} connection={connection} />
          ))}
        </ul>
      </DataState>
      <ApiKeyDialog open={addingClaude} onOpenChange={setAddingClaude} />
      <CodexLoginDialog open={addingCodex} onOpenChange={setAddingCodex} />
    </div>
  );
}
