import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ticketColumns,
  type Board as BoardData,
  type Ticket,
  type TicketStatus,
} from '../../../shared/schemas/tickets';
import { errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { useToast } from '../../components/ui/Toast';
import { boardKey, moveTicket, useBoard } from './api';
import { Column } from './Column';
import { TicketCardView } from './TicketCard';
import { TicketDialog } from './TicketDialog';

type Columns = Record<TicketStatus, Ticket[]>;

/** Buttons, links and menus inside a card must not start a drag. */
class CardPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        const target = nativeEvent.target as HTMLElement | null;
        // the grip button starts a drag; other buttons, links and menus do not
        if (target?.closest('[data-testid="drag-handle"]')) return true;
        return !target?.closest(
          'button, a, input, textarea, [role="menuitem"]',
        );
      },
    },
  ];
}

const instructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a ticket, press Space or Enter. Use the arrow keys to move it between columns and positions, then press Space or Enter to drop it. Press Escape to cancel.',
};

const labelOf = (status: TicketStatus) =>
  ticketColumns.find((c) => c.status === status)?.label ?? status;

function toColumns(board: BoardData): Columns {
  const columns = { new: [], review: [], testing: [], end: [] } as Columns;
  for (const column of board.columns) columns[column.status] = column.tickets;
  return columns;
}

/**
 * The four-column board. A drag changes a local copy so the card follows the
 * pointer; the drop is then saved, and the server's answer replaces the local
 * copy. If saving fails the card goes back and an error is shown.
 */
export function Board({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const toast = useToast();
  const query = useBoard(projectId);
  const [local, setLocal] = useState<Columns | null>(null);
  // The layout including a move still in progress. Drag announcements are spoken in the same
  // event as the move, before a re-render, so they read this instead of React state.
  const liveLayout = useRef<Columns | null>(null);
  const update = (next: Columns | null) => {
    liveLayout.current = next;
    setLocal(next);
  };
  const [active, setActive] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  // Last place spoken for the card being dragged, so a move that goes nowhere is not repeated.
  const lastPlace = useRef('');

  const sensors = useSensors(
    useSensor(CardPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const server = query.data ? toColumns(query.data) : null;
  const columns = local ?? server;
  const total = columns
    ? Object.values(columns).reduce((n, list) => n + list.length, 0)
    : 0;

  const findContainer = (id: string | number, from: Columns) => {
    if (id in from) return id as TicketStatus;
    return (Object.keys(from) as TicketStatus[]).find((status) =>
      from[status].some((t) => t.id === id),
    );
  };
  const titleOf = (id: string | number) => {
    const view = liveLayout.current ?? columns;
    return view
      ? Object.values(view)
          .flat()
          .find((t) => t.id === id)?.title
      : undefined;
  };
  const placeOf = (id: string | number) => {
    const view = liveLayout.current ?? columns;
    if (!view) return '';
    const status = findContainer(id, view);
    if (!status) return '';
    const list = view[status];
    const index = list.findIndex((t) => t.id === id);
    return `column ${labelOf(status)}, position ${index + 1} of ${list.length}`;
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => {
      lastPlace.current = placeOf(a.id);
      return `Picked up ticket ${titleOf(a.id)}, ${lastPlace.current}.`;
    },
    onDragOver: ({ active: a, over }) => {
      const place = placeOf(a.id);
      if (!over || place === lastPlace.current) return undefined;
      lastPlace.current = place;
      return `Ticket ${titleOf(a.id)} is now in ${place}.`;
    },
    onDragEnd: ({ active: a }) =>
      `Dropped ticket ${titleOf(a.id)} in ${placeOf(a.id)}.`,
    onDragCancel: ({ active: a }) =>
      `Move cancelled. Ticket ${titleOf(a.id)} is back in ${placeOf(a.id)}.`,
  };

  function onDragStart(event: DragStartEvent) {
    if (!columns) return;
    setActive(
      Object.values(columns)
        .flat()
        .find((t) => t.id === event.active.id) ?? null,
    );
    update(columns);
  }

  /** While dragging across columns the card is moved into the column it is over. */
  function onDragOver({ active: a, over }: DragOverEvent) {
    if (!local || !over) return;
    const from = findContainer(a.id, local);
    const to = findContainer(over.id, local);
    if (!from || !to || from === to) return;
    const fromItems = local[from];
    const toItems = local[to];
    const moving = fromItems.find((t) => t.id === a.id);
    if (!moving) return;
    const overIndex = toItems.findIndex((t) => t.id === over.id);
    const translated = a.rect.current.translated;
    const below =
      overIndex >= 0 &&
      translated !== null &&
      translated.top > over.rect.top + over.rect.height / 2;
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : toItems.length;
    update({
      ...local,
      [from]: fromItems.filter((t) => t.id !== a.id),
      [to]: [...toItems.slice(0, index), moving, ...toItems.slice(index)],
    });
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActive(null);
    if (!local || !server) return update(null);
    const from = findContainer(a.id, local);
    const to = over ? findContainer(over.id, local) : undefined;
    if (!from || !to) return update(null);
    let next = local;
    if (over && from === to) {
      const oldIndex = local[from].findIndex((t) => t.id === a.id);
      const newIndex = local[to].findIndex((t) => t.id === over.id);
      if (newIndex >= 0 && oldIndex !== newIndex)
        next = { ...local, [to]: arrayMove(local[to], oldIndex, newIndex) };
    }
    const ticket = Object.values(server)
      .flat()
      .find((t) => t.id === a.id);
    const finalStatus = findContainer(a.id, next);
    if (!ticket || !finalStatus) return update(null);
    const finalIndex = next[finalStatus].findIndex((t) => t.id === a.id);
    if (ticket.status === finalStatus && ticket.position === finalIndex)
      return update(null);
    update(next);
    void save(ticket, finalStatus, finalIndex);
  }

  async function save(ticket: Ticket, toStatus: TicketStatus, toIndex: number) {
    try {
      const board = await moveTicket(ticket.id, toStatus, toIndex);
      queryClient.setQueryData(boardKey(projectId), board);
      announce(`Saved. ${ticket.title} is in ${labelOf(toStatus)}.`);
    } catch (failure) {
      toast({
        title: 'The move was not saved',
        description: `${errorMessage(failure)} The ticket is back where it was.`,
        tone: 'error',
      });
    } finally {
      update(null);
    }
  }

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: boardKey(projectId) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0">Board</h2>
        <Button
          variant="primary"
          data-testid="new-ticket"
          disabled={!query.data}
          onClick={() => setCreating(true)}
        >
          New ticket
        </Button>
      </div>
      <DataState
        what="the board"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={false}
        empty={null}
        onRetry={() => void query.refetch()}
      >
        {columns && (
          <>
            {total === 0 && (
              <p>
                No tickets yet. Create the first ticket to start the board: it
                goes to the New column.
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              accessibility={{
                announcements,
                screenReaderInstructions: instructions,
              }}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={() => {
                setActive(null);
                update(null);
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {ticketColumns.map(({ status, label }) => (
                  <Column
                    key={status}
                    status={status}
                    label={label}
                    tickets={columns[status]}
                    projectId={projectId}
                    onMove={(ticket, toStatus, toIndex) =>
                      void save(ticket, toStatus, toIndex)
                    }
                    onChanged={() => void refresh()}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {active ? <TicketCardView ticket={active} dragging /> : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </DataState>
      {creating && (
        <TicketDialog
          projectId={projectId}
          open={creating}
          onOpenChange={setCreating}
          onSaved={(ticket) => {
            announce(`Created ticket ${ticket.title} in New.`);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
