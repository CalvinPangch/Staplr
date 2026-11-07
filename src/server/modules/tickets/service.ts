import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import {
  ticketColumns,
  type Board,
  type Ticket,
  type TicketInput,
  type TicketPatch,
  type TicketStatus,
} from '../../../shared/schemas/tickets.js';

/** Parks the ticket being moved where no other row can collide with it. */
const parked = -(2 ** 40);

/**
 * The ticket board (research R17). Each ticket has a column (status) and a
 * 0-based position that is contiguous within (project, column). Every change
 * runs in one transaction. Positions are shifted through negative temporary
 * values because the unique index is checked row by row.
 */
export function createTicketService({
  db,
  clock,
}: {
  db: Database.Database;
  clock: () => number;
}) {
  const now = () => new Date(clock()).toISOString();

  const assertProject = (projectId: string) => {
    const row = db
      .prepare('SELECT 1 FROM project WHERE id=? AND deletedAt IS NULL')
      .get(projectId);
    if (!row)
      throw new ServiceError(404, 'not_found', 'That project does not exist.');
  };
  const find = (id: string) =>
    db
      .prepare(
        `SELECT t.* FROM ticket t JOIN project p ON p.id = t.projectId
         WHERE t.id=? AND p.deletedAt IS NULL`,
      )
      .get(id) as Ticket | undefined;
  function mustFind(id: string): Ticket {
    const ticket = find(id);
    if (!ticket)
      throw new ServiceError(404, 'not_found', 'That ticket does not exist.');
    return ticket;
  }

  /** Moves every ticket at or after `from` in a column by `delta` places. */
  function shift(
    projectId: string,
    status: TicketStatus,
    from: number,
    delta: number,
  ) {
    db.prepare(
      'UPDATE ticket SET position = -(position + ?) - 1 WHERE projectId=? AND status=? AND position >= ?',
    ).run(delta, projectId, status, from);
    db.prepare(
      'UPDATE ticket SET position = -position - 1 WHERE projectId=? AND status=? AND position < 0 AND position > ?',
    ).run(projectId, status, parked / 2);
  }

  const count = (projectId: string, status: TicketStatus) =>
    (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM ticket WHERE projectId=? AND status=? AND position >= 0',
        )
        .get(projectId, status) as { n: number }
    ).n;

  function board(projectId: string): Board {
    const rows = db
      .prepare(
        'SELECT * FROM ticket WHERE projectId=? ORDER BY status, position',
      )
      .all(projectId) as Ticket[];
    return {
      projectId,
      columns: ticketColumns.map(({ status, label }) => ({
        status,
        label: label as Board['columns'][number]['label'],
        tickets: rows.filter((t) => t.status === status),
      })),
    };
  }

  return {
    getBoard(projectId: string): Board {
      assertProject(projectId);
      return board(projectId);
    },

    /** A new ticket goes to the top of New; the others shift down. */
    create(projectId: string, input: TicketInput): Ticket {
      assertProject(projectId);
      const id = randomUUID();
      const at = now();
      db.transaction(() => {
        shift(projectId, 'new', 0, 1);
        db.prepare(
          `INSERT INTO ticket(id,projectId,title,description,status,position,createdAt,updatedAt,statusChangedAt)
           VALUES(?,?,?,?,'new',0,?,?,?)`,
        ).run(id, projectId, input.title, input.description ?? '', at, at, at);
      })();
      return mustFind(id);
    },

    update(id: string, patch: TicketPatch): Ticket {
      const ticket = mustFind(id);
      db.prepare(
        'UPDATE ticket SET title=?, description=?, updatedAt=? WHERE id=?',
      ).run(
        patch.title ?? ticket.title,
        patch.description ?? ticket.description,
        now(),
        id,
      );
      return mustFind(id);
    },

    /**
     * Any column to any column and position. toIndex is clamped to the target
     * column. statusChangedAt changes only when the column does.
     */
    move(id: string, toStatus: TicketStatus, toIndex: number): Board {
      if (!Number.isInteger(toIndex) || toIndex < 0)
        throw new ServiceError(
          422,
          'invalid_input',
          'The position must be a whole number of 0 or more.',
        );
      const ticket = mustFind(id);
      const sameColumn = ticket.status === toStatus;
      if (
        sameColumn &&
        Math.min(toIndex, count(ticket.projectId, toStatus) - 1) ===
          ticket.position
      )
        return board(ticket.projectId);
      const at = now();
      db.transaction(() => {
        db.prepare('UPDATE ticket SET position=? WHERE id=?').run(parked, id);
        shift(ticket.projectId, ticket.status, ticket.position + 1, -1);
        const index = Math.min(toIndex, count(ticket.projectId, toStatus));
        shift(ticket.projectId, toStatus, index, 1);
        db.prepare(
          'UPDATE ticket SET status=?, position=?, statusChangedAt=?, updatedAt=? WHERE id=?',
        ).run(
          toStatus,
          index,
          sameColumn ? ticket.statusChangedAt : at,
          at,
          id,
        );
      })();
      return board(ticket.projectId);
    },

    /** Deleting closes the gap behind it. */
    remove(id: string): void {
      const ticket = mustFind(id);
      db.transaction(() => {
        db.prepare('DELETE FROM ticket WHERE id=?').run(id);
        shift(ticket.projectId, ticket.status, ticket.position + 1, -1);
      })();
    },

    /** Part of deleting a project (FR-030). */
    removeAllForProject(projectId: string): void {
      db.prepare('DELETE FROM ticket WHERE projectId=?').run(projectId);
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;

declare module 'fastify' {
  interface FastifyInstance {
    tickets: TicketService;
  }
}
