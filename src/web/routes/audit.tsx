import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { DataState } from '../components/ui/DataState';

interface AuditEntry {
  id: string;
  at: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
}

const pageSize = 200;

const actionLabels: Record<string, string> = {
  'scc.added': 'Source control connection added',
  'scc.replaced': 'Source control token replaced',
  'scc.removed': 'Source control connection removed',
  'provider.added': 'Provider connection added',
  'provider.replaced': 'Provider credentials replaced',
  'provider.relogged': 'Provider re-login completed',
  'provider.removed': 'Provider connection removed',
  'soul.created': 'Soul created',
  'soul.updated': 'Soul edited',
  'soul.copied': 'Soul copied',
  'soul.deleted': 'Soul deleted',
  'agent.created': 'Agent created',
  'agent.updated': 'Agent edited',
  'agent.deleted': 'Agent deleted',
  'project.created': 'Project added',
  'project.deleted': 'Project deleted',
  'price.changed': 'Model price changed',
  'models.discovered': 'Codex models found',
  'prices.refreshed': 'Prices read from the official page',
};

export function AuditPage() {
  const query = useInfiniteQuery({
    queryKey: ['audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<AuditEntry[]>(
        `/api/audit-entries${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) =>
      last.length >= pageSize ? last[last.length - 1]?.at : undefined,
  });
  const entries = query.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1>Audit log</h1>
      <p className="text-muted">
        Changes to connections, newest first. Secret values are never recorded.
      </p>
      <DataState
        what="audit entries"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={entries.length === 0}
        empty={<p>No audit entries yet.</p>}
        onRetry={() => void query.refetch()}
      >
        <div className="data-table overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Audit entries, newest first</caption>
            <thead>
              <tr className="border-b border-edge">
                <th scope="col" className="p-2">
                  Time
                </th>
                <th scope="col" className="p-2">
                  Action
                </th>
                <th scope="col" className="p-2">
                  Target
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-edge-soft">
                  <td className="p-2">
                    <time dateTime={entry.at}>
                      {new Date(entry.at).toLocaleString()}
                    </time>
                  </td>
                  <td className="p-2">
                    {actionLabels[entry.action] ?? entry.action}
                  </td>
                  <td className="p-2">{entry.targetName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.hasNextPage && (
          <Button
            variant="secondary"
            busy={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load older entries
          </Button>
        )}
      </DataState>
    </div>
  );
}
