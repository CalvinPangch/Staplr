import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DataState } from '../components/ui/DataState';
import { formatTime } from '../features/source-control/api';

interface ErrorEvent {
  id: string;
  at: string;
  requestId: string;
  route: string;
  message: string;
  stack: string | null;
}

/** Errors captured on this installation, newest first. Secrets are redacted before storage. */
export function DiagnosticsPage() {
  const query = useQuery({
    queryKey: ['error-events'],
    queryFn: () => api<ErrorEvent[]>('/api/error-events'),
    staleTime: 0,
  });
  const events = query.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <h1>Diagnostics</h1>
      <p className="text-muted">
        Unexpected errors recorded on this installation, newest first (at most
        200). Nothing is sent anywhere. Secret values are removed.
      </p>
      <DataState
        what="error events"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={events.length === 0}
        empty={<p>No errors recorded. Everything is working.</p>}
        onRetry={() => void query.refetch()}
      >
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-1 rounded-lg border border-edge-soft bg-surface p-4"
            >
              <p className="m-0 font-medium">{event.message}</p>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Time</dt>
                <dd>
                  <time dateTime={event.at}>{formatTime(event.at)}</time>
                </dd>
                <dt className="text-muted">Route</dt>
                <dd className="break-all">{event.route}</dd>
                <dt className="text-muted">Request ID</dt>
                <dd className="break-all">{event.requestId}</dd>
              </dl>
              {event.stack && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2">
                    Stack trace
                  </summary>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">
                    {event.stack}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </DataState>
    </div>
  );
}
