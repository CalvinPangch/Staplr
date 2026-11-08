import type { Ticket, TicketStatus } from '../../../shared/schemas/tickets';
import { ticketColumns } from '../../../shared/schemas/tickets';
import { DropdownMenu } from '../../components/ui/DropdownMenu';

/**
 * A menu on every card: the single-pointer and keyboard alternative to
 * dragging (WCAG 2.5.7). It lists the other three columns plus Move up and
 * Move down, which are disabled at the ends of a column.
 */
export function MoveToMenu({
  ticket,
  columnSize,
  onMove,
}: {
  ticket: Ticket;
  columnSize: number;
  onMove: (toStatus: TicketStatus, toIndex: number) => void;
}) {
  const others = ticketColumns.filter((c) => c.status !== ticket.status);
  return (
    <DropdownMenu
      label={`Move ${ticket.title}`}
      trigger={<span aria-hidden="true">⋯</span>}
      items={[
        ...others.map((column) => ({
          label: `Move to ${column.label}`,
          onSelect: () => onMove(column.status, 0),
        })),
        {
          label: 'Move up',
          disabled: ticket.position === 0,
          onSelect: () => onMove(ticket.status, ticket.position - 1),
        },
        {
          label: 'Move down',
          disabled: ticket.position >= columnSize - 1,
          onSelect: () => onMove(ticket.status, ticket.position + 1),
        },
      ]}
    />
  );
}
