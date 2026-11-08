import {
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from 'react';
import { useSortable } from '@dnd-kit/sortable';
import type { Ticket, TicketStatus } from '../../../shared/schemas/tickets';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { timeInColumn } from './api';
import { DeleteTicketDialog } from './DeleteTicketDialog';
import { MoveToMenu } from './MoveToMenu';
import { TicketDialog } from './TicketDialog';

/** What a card looks like, also used for the picture that follows the pointer. */
export function TicketCardView({
  ticket,
  dragging = false,
  handle,
  footer,
}: {
  ticket: Ticket;
  dragging?: boolean;
  handle?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'board-ticket flex flex-col gap-2 rounded-lg border border-edge-soft bg-bg p-3 shadow-sm',
        dragging && 'shadow-lg ring-2 ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 min-w-0 break-words text-base font-semibold">
          {ticket.title}
        </h3>
        {handle}
      </div>
      {ticket.description && (
        <p className="m-0 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted">
          {ticket.description}
        </p>
      )}
      <p className="m-0 text-xs text-muted">
        In this column for{' '}
        <time dateTime={ticket.statusChangedAt}>
          {timeInColumn(ticket.statusChangedAt)}
        </time>
      </p>
      {footer}
    </div>
  );
}

export function TicketCard({
  ticket,
  projectId,
  columnSize,
  onMove,
  onChanged,
}: {
  ticket: Ticket;
  projectId: string;
  columnSize: number;
  onMove: (toStatus: TicketStatus, toIndex: number) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        transition,
      }}
      className={cn('list-none', isDragging && 'opacity-40')}
    >
      {/* The whole card can be dragged with a pointer. The grip button is the one
          stop for the keyboard: a card that contains buttons must not itself be a button. */}
      <div
        data-testid="ticket-card"
        data-ticket-id={ticket.id}
        className="rounded-lg"
        onPointerDown={
          listeners?.onPointerDown as
            PointerEventHandler<HTMLDivElement> | undefined
        }
      >
        <TicketCardView
          ticket={ticket}
          handle={
            <button
              ref={setActivatorNodeRef}
              type="button"
              data-testid="drag-handle"
              aria-label={`Drag ${ticket.title}`}
              className="inline-flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg border border-edge bg-bg text-fg hover:bg-surface"
              {...attributes}
              onKeyDown={
                listeners?.onKeyDown as
                  KeyboardEventHandler<HTMLButtonElement> | undefined
              }
            >
              <span aria-hidden="true">⠿</span>
            </button>
          }
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <MoveToMenu
                ticket={ticket}
                columnSize={columnSize}
                onMove={onMove}
              />
              <Button onClick={() => setEditing(true)}>
                Edit<span className="sr-only"> {ticket.title}</span>
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                Delete<span className="sr-only"> {ticket.title}</span>
              </Button>
            </div>
          }
        />
      </div>
      {editing && (
        <TicketDialog
          projectId={projectId}
          ticket={ticket}
          open={editing}
          onOpenChange={setEditing}
          onSaved={onChanged}
        />
      )}
      {deleting && (
        <DeleteTicketDialog
          ticket={ticket}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={onChanged}
        />
      )}
    </li>
  );
}
