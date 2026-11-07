import type { ReactNode } from 'react';
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
 * error and success states are always explicit (Constitution III).
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
      <p role="status" className="text-muted">
        Loading {what}…
      </p>
    );
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-danger bg-danger-soft p-4 text-danger"
      >
        <p className="font-medium">
          Could not load {what}. {errorMessage(error)}
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
      <div className="rounded-lg border border-edge-soft bg-surface p-4">
        {empty ?? <p>No {what} yet.</p>}
      </div>
    );
  return <>{children}</>;
}
