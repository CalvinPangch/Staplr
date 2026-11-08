import { useState } from 'react';
import type { Ticket } from '../../../shared/schemas/tickets';
import { api, errorMessage } from '../../lib/api';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export function DeleteTicketDialog({
  ticket,
  open,
  onOpenChange,
  onDeleted,
}: {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={`Delete “${ticket.title}”?`}
      description="The ticket is deleted for good. This cannot be undone."
      confirmLabel="Delete ticket"
      destructive
      busy={busy}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        api(`/api/tickets/${ticket.id}`, { method: 'DELETE' })
          .then(() => {
            onDeleted();
            onOpenChange(false);
          })
          .catch((failure: unknown) => setError(errorMessage(failure)))
          .finally(() => setBusy(false));
      }}
    >
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
