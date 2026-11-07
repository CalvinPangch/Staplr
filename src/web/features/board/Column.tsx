import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Ticket, TicketStatus } from '../../../shared/schemas/tickets';
import { cn } from '../../lib/cn';
import { TicketCard } from './TicketCard';

/** One labelled region per column; it is also a drop target when empty. */
export function Column({
  status,
  label,
  tickets,
  projectId,
  onMove,
  onChanged,
}: {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
  projectId: string;
  onMove: (ticket: Ticket, toStatus: TicketStatus, toIndex: number) => void;
  onChanged: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `column-heading-${status}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`column-${status}`}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-edge-soft bg-surface p-3',
        isOver && 'ring-2 ring-primary',
      )}
    >
      <h2 id={headingId} className="m-0 flex items-baseline gap-2 text-base">
        {label}
        <span className="text-sm font-normal text-muted">
          {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
        </span>
      </h2>
      <SortableContext
        items={tickets.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          aria-label={`${label} tickets`}
          className="m-0 flex min-h-16 list-none flex-col gap-2 p-0"
        >
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              projectId={projectId}
              columnSize={tickets.length}
              onMove={(toStatus, toIndex) => onMove(ticket, toStatus, toIndex)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      </SortableContext>
      {tickets.length === 0 && (
        <p className="m-0 text-sm text-muted">No tickets in {label}.</p>
      )}
    </section>
  );
}
