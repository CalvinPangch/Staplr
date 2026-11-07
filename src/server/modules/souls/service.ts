import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import type { Soul, SoulInput } from '../../../shared/schemas/souls.js';
import { recordAudit } from '../audit/service.js';

interface SoulRow {
  id: string;
  name: string;
  roleType: Soul['roleType'];
  description: string;
  instructions: string;
  isDefault: number;
  copiedFromId: string | null;
}

/** Who uses a soul. Agents (a later feature) register themselves here. */
export type SoulUsage = (soulId: string) => { id: string; name: string }[];

export function createSoulService({
  db,
  clock,
  usage = () => [],
}: {
  db: Database.Database;
  clock: () => number;
  usage?: SoulUsage;
}) {
  const now = () => new Date(clock()).toISOString();
  const usedBy: SoulUsage[] = [usage];

  const toPublic = (row: SoulRow): Soul => ({
    id: row.id,
    name: row.name,
    roleType: row.roleType,
    description: row.description,
    instructions: row.instructions,
    isDefault: row.isDefault === 1,
    copiedFromId: row.copiedFromId,
    usedByAgents: usedBy
      .flatMap((source) => source(row.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  const find = (id: string) =>
    db.prepare('SELECT * FROM soul WHERE id=?').get(id) as SoulRow | undefined;
  function mustFind(id: string): SoulRow {
    const row = find(id);
    if (!row)
      throw new ServiceError(404, 'not_found', 'That soul does not exist.');
    return row;
  }
  const nameTaken = (name: string, exceptId?: string) =>
    Boolean(
      db
        .prepare('SELECT 1 FROM soul WHERE name=? AND id IS NOT ?')
        .get(name, exceptId ?? null),
    );
  const taken = () =>
    new ServiceError(
      409,
      'conflict',
      'A soul with that name already exists. Choose a different name.',
    );
  const readOnly = () =>
    new ServiceError(
      403,
      'forbidden',
      'Default souls are read-only. Copy it to customize it.',
    );

  return {
    /** Defaults first, then custom souls, each by name. */
    list(): Soul[] {
      return (
        db
          .prepare('SELECT * FROM soul ORDER BY isDefault DESC, name')
          .all() as SoulRow[]
      ).map(toPublic);
    },

    get(id: string): Soul {
      return toPublic(mustFind(id));
    },

    create(input: SoulInput): Soul {
      if (nameTaken(input.name)) throw taken();
      const id = randomUUID();
      const at = now();
      db.prepare(
        `INSERT INTO soul(id,name,roleType,description,instructions,isDefault,copiedFromId,createdAt,updatedAt)
         VALUES(?,?,?,?,?,0,NULL,?,?)`,
      ).run(
        id,
        input.name,
        input.roleType,
        input.description,
        input.instructions,
        at,
        at,
      );
      recordAudit(db, {
        action: 'soul.created',
        targetType: 'soul',
        targetId: id,
        targetName: input.name,
        detail: { roleType: input.roleType },
        at,
      });
      return toPublic(mustFind(id));
    },

    update(id: string, input: SoulInput): Soul {
      const row = mustFind(id);
      if (row.isDefault === 1) throw readOnly();
      if (input.roleType !== row.roleType)
        throw new ServiceError(
          422,
          'invalid_input',
          'The role type cannot be changed. Create a new soul with the role you want.',
        );
      if (nameTaken(input.name, id)) throw taken();
      const at = now();
      db.prepare(
        'UPDATE soul SET name=?, description=?, instructions=?, updatedAt=? WHERE id=?',
      ).run(input.name, input.description, input.instructions, at, id);
      recordAudit(db, {
        action: 'soul.updated',
        targetType: 'soul',
        targetId: id,
        targetName: input.name,
        at,
      });
      return toPublic(mustFind(id));
    },

    /** Keeps the role type; without a name the copy is "Copy of <name>", numbered if taken. */
    copy(id: string, name?: string): Soul {
      const source = mustFind(id);
      let chosen = name;
      if (chosen === undefined) {
        chosen = `Copy of ${source.name}`;
        for (let n = 2; nameTaken(chosen); n++)
          chosen = `Copy of ${source.name} (${n})`.slice(0, 80);
      } else if (nameTaken(chosen)) throw taken();
      if (chosen.length > 80)
        throw new ServiceError(
          422,
          'invalid_input',
          'Enter a name of 1 to 80 characters.',
        );
      const copyId = randomUUID();
      const at = now();
      db.prepare(
        `INSERT INTO soul(id,name,roleType,description,instructions,isDefault,copiedFromId,createdAt,updatedAt)
         VALUES(?,?,?,?,?,0,?,?,?)`,
      ).run(
        copyId,
        chosen,
        source.roleType,
        source.description,
        source.instructions,
        source.id,
        at,
        at,
      );
      recordAudit(db, {
        action: 'soul.copied',
        targetType: 'soul',
        targetId: copyId,
        targetName: chosen,
        detail: { copiedFrom: source.name },
        at,
      });
      return toPublic(mustFind(copyId));
    },

    delete(id: string): void {
      const row = mustFind(id);
      if (row.isDefault === 1) throw readOnly();
      const agents = usedBy.flatMap((source) => source(id));
      if (agents.length > 0)
        throw new ServiceError(
          409,
          'soul_in_use',
          'Agents still use this soul. Change or delete them first.',
          { agents },
        );
      db.prepare('DELETE FROM soul WHERE id=?').run(id);
      recordAudit(db, {
        action: 'soul.deleted',
        targetType: 'soul',
        targetId: id,
        targetName: row.name,
        at: now(),
      });
    },

    /** Agents register what they depend on; the soul module never reads agent tables. */
    registerUsage(source: SoulUsage): void {
      usedBy.push(source);
    },
  };
}

export type SoulService = ReturnType<typeof createSoulService>;
