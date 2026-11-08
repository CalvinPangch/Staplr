import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { AddConnectionDialog } from '../../features/source-control/AddConnectionDialog';
import { ConnectionCard } from '../../features/source-control/ConnectionCard';
import {
  connectionsKey,
  fetchConnections,
  useConnections,
} from '../../features/source-control/api';

const pollMs = 800;
const giveUpMs = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SourceControlPage() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const query = useConnections();
  const [adding, setAdding] = useState(false);
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
          queryKey: connectionsKey,
          queryFn: fetchConnections,
          staleTime: 0,
        });
        if (fresh.every((c) => c.lastCheckedAt !== before.get(c.id))) {
          announce('All connections checked.');
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
        <h1>Source control</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            busy={checkingAll}
            disabled={connections.length === 0}
            onClick={() => void checkAll()}
          >
            Check all connections
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add connection
          </Button>
        </div>
      </div>
      <p className="text-muted">
        GitHub and GitLab tokens let agents read your repositories and propose
        changes. Tokens are stored encrypted and shown only by their last four
        characters. Connections are re-checked every hour.
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
        what="source control connections"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={connections.length === 0}
        empty={
          <p>
            No source control connections yet. Add a GitHub or GitLab token so
            agents can reach your repositories.
          </p>
        }
        onRetry={() => void query.refetch()}
      >
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} />
          ))}
        </ul>
      </DataState>
      <AddConnectionDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
