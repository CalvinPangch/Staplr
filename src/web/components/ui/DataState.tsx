import type { ReactNode } from 'react';
import { CircleX, Inbox, LoaderCircle } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { Button } from './Button';

export interface DataStateProps {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  /** Name of what is loading, for example "audit entries". */
  what: string;
  /** Shown when there is nothing yet; should say what to do next. */
  empty?: ReactNode;
  /** Present when the failure can be retried. */
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Every screen renders its data through this component, so loading, empty,
 * error and success states are always explicit and look the same everywhere
 * (Constitution III; feature 004, FR-009).
 */
export function DataState({
  isLoading,
  error,
  isEmpty = false,
  what,
  empty,
  onRetry,
  children,
}: DataStateProps) {
  if (isLoading)
    return (
      <div
        role="status"
        data-state="loading"
        className="flex min-h-32 items-center justify-center gap-2 rounded-card bg-surface p-6 text-muted"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin motion-reduce:animate-none"
        />
        <span>Loading {what}…</span>
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        data-state="error"
        className="flex flex-col items-start gap-3 rounded-card border border-status-failed bg-status-failed-soft p-4 text-status-failed"
      >
        <p className="flex items-center gap-2 font-medium">
          <CircleX aria-hidden="true" className="size-5 shrink-0" />
          <span>
            Could not load {what}. {errorMessage(error)}
          </span>
        </p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  if (isEmpty)
    return (
      <div
        data-state="empty"
        className="flex flex-col items-center gap-3 rounded-card bg-surface p-8 text-center shadow-card"
      >
        <Inbox aria-hidden="true" className="size-8 text-muted" />
        <div className="flex flex-col items-center gap-3 text-fg">
          {empty ?? <p>No {what} yet.</p>}
        </div>
      </div>
    );
  return <>{children}</>;
}
