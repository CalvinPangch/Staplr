import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  instructionsOf,
  parseAgentFile,
  renderAgentFile,
  type AgentSettings,
} from '../../src/shared/agent-file';
import { migrateUp, migrateDown } from '../../src/server/db/migrate';
it('applies all migrations, reverses them and reproduces the same schema', () => {
  const db = new Database(':memory:');
  try {
    const dump = () =>
      db
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all();
    migrateUp(db);
    const first = dump();
    expect(first.length).toBeGreaterThan(1);
    migrateDown(db, 0);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
    ).toEqual([{ name: '__migrations' }]);
    migrateUp(db);
    expect(dump()).toEqual(first);
    migrateUp(db);
    expect(dump()).toEqual(first);
  } finally {
    db.close();
  }
});

it('0009 adds model discovery, price refresh and official prices, and closes hand-set prices', () => {
  const db = new Database(':memory:');
  try {
    migrateUp(db);
    const columns = (table: string) =>
      (
        db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map((c) => c.name);
    expect(columns('provider_connection')).toEqual(
      expect.arrayContaining([
        'discoveryStatus',
        'discoveryError',
        'modelsRefreshedAt',
      ]),
    );
    expect(columns('discovered_model')).toEqual([
      'providerConnectionId',
      'model',
      'label',
      'listedAt',
    ]);
    expect(columns('price_refresh')).toEqual([
      'provider',
      'lastAttemptAt',
      'lastSuccessAt',
      'lastError',
    ]);

    // an official row is accepted; an unknown source is not
    db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
       VALUES('o1','claude','m','1','2','2026-11-08T00:00:00.000Z','official')`,
    ).run();
    expect(() =>
      db
        .prepare(
          `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
           VALUES('x1','claude','n','1','2','2026-11-08T00:00:00.000Z','guess')`,
        )
        .run(),
    ).toThrow();
    // discovered models are removed with their connection; a bad status is refused
    expect(() =>
      db
        .prepare("UPDATE provider_connection SET discoveryStatus='later'")
        .run(),
    ).not.toThrow(); // no rows yet
  } finally {
    db.close();
  }
});

it('upgrading closes every current hand-set price and keeps it as history', () => {
  const db = new Database(':memory:');
  try {
    migrateDown(db, 0);
    // bring the schema to just before 0009, add a hand-set price, then upgrade
    migrateUp(db);
    migrateDown(db, 8);
    db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
       VALUES('u1','claude','claude-sonnet-5-5','9','99','2026-11-01T00:00:00.000Z','user')`,
    ).run();
    migrateUp(db);
    const row = db
      .prepare("SELECT effectiveUntil, source FROM model_price WHERE id='u1'")
      .get() as {
      effectiveUntil: string | null;
      source: string;
    };
    expect(row.source).toBe('user');
    expect(row.effectiveUntil).not.toBeNull();
  } finally {
    db.close();
  }
});

describe('0010 turns every soul and agent pair into one agent file', () => {
  const at = '2026-11-01T00:00:00.000Z';
  /** A database at 0009 with souls and agents the upgrade must carry over. */
  function seeded() {
    const db = new Database(':memory:');
    migrateUp(db);
    migrateDown(db, 9);
    const run = (sql: string, ...args: unknown[]) =>
      db.prepare(sql).run(...args);
    run(
      `INSERT INTO provider_connection(id,provider,name,authType,apiKeySealed,status,createdAt,updatedAt)
       VALUES('pc1','claude','Work Claude','api_key',x'00','connected',?,?)`,
      at,
      at,
    );
    const soul = run.bind(
      null,
      `INSERT INTO soul(id,name,roleType,description,instructions,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,0,?,?)`,
    );
    soul(
      'shared',
      'Shared Dev',
      'developer',
      'Shared desc',
      '# Shared\n\nDo things.',
      at,
      at,
    );
    soul('unused', 'Unused QA', 'qa', 'Unused', 'Unused text', at, at);
    soul(
      'nodesc',
      'Plain BA',
      'business_analyst',
      '',
      'Only instructions',
      at,
      at,
    );
    soul('big', 'Big', 'custom', 'd'.repeat(500), 'i'.repeat(19_990), at, at);
    const agent = run.bind(
      null,
      `INSERT INTO agent(id,name,soulId,provider,providerConnectionId,model,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)`,
    );
    agent(
      'a1',
      'Alice',
      'shared',
      'claude',
      'pc1',
      'claude-sonnet-5-5',
      at,
      at,
    );
    agent('a2', 'Bob', 'shared', 'claude', null, 'claude-opus-5-5', at, at);
    agent('a3', 'Cara', 'nodesc', 'claude', 'pc1', 'claude-sonnet-5-5', at, at);
    agent('a4', 'Dan', 'big', 'claude', 'pc1', 'claude-sonnet-5-5', at, at);
    agent(
      'a5',
      'Pam',
      'default-project_manager',
      'claude',
      'pc1',
      'claude-sonnet-5-5',
      at,
      at,
    );
    run(
      `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
       VALUES('p1','Shop','o/shop','1','main','downloaded',?,?)`,
      at,
      at,
    );
    run(
      `INSERT INTO team_assignment(projectId,agentId,assignedAt) VALUES('p1','a5',?)`,
      at,
    );
    run(
      `INSERT INTO usage_record(id,projectId,agentId,projectName,agentName,agentRole,ticketId,ticketTitle,provider,model,startedAt,endedAt)
       VALUES('u1','p1','a1','Shop','Alice','developer','t1','Ticket','claude','claude-sonnet-5-5',?,?)`,
      at,
      at,
    );
    return db;
  }
  type AgentRow = {
    id: string;
    name: string;
    role: string;
    model: string | null;
    definition: string;
    revision: number;
  };
  const agents = (db: Database.Database) =>
    Object.fromEntries(
      (db.prepare('SELECT * FROM agent').all() as AgentRow[]).map((a) => [
        a.id,
        a,
      ]),
    );
  const settings = (
    name: string,
    role: AgentSettings['role'],
    connection: string,
    model: string,
  ) => ({ name, role, provider: 'claude', connection, model }) as const;
  const defaultPm = () =>
    readFileSync(
      'src/server/modules/agents/templates/project-manager.md',
      'utf8',
    );

  it('gives each agent its own file, keeps unused souls as templates and archives souls', () => {
    const db = seeded();
    try {
      migrateUp(db);
      const rows = agents(db);
      expect(rows.a1?.definition).toBe(
        renderAgentFile(
          settings('Alice', 'developer', 'Work Claude', 'claude-sonnet-5-5'),
          'Shared desc\n\n# Shared\n\nDo things.',
        ),
      );
      expect(rows.a1).toMatchObject({ role: 'developer', revision: 1 });
      // shares the soul's text, as its own copy; the disconnected connection is empty
      expect(rows.a2?.definition).toBe(
        renderAgentFile(
          settings('Bob', 'developer', '', 'claude-opus-5-5'),
          'Shared desc\n\n# Shared\n\nDo things.',
        ),
      );
      // no description: the instructions alone
      expect(parseAgentFile(rows.a3?.definition ?? '')).toMatchObject({
        ok: true,
        instructions: 'Only instructions',
      });
      // too long with the description: it is left out and the agent is named in the audit log
      // (the file is over the save limit until the owner shortens it, so read the instructions directly)
      expect(instructionsOf(rows.a4?.definition ?? '')).toBe(
        'i'.repeat(19_990),
      );
      expect(
        db
          .prepare(
            "SELECT targetName FROM audit_entry WHERE action='agents.upgraded'",
          )
          .all(),
      ).toEqual([{ targetName: 'Dan' }]);
      // a default soul: its description, then its instructions
      const pm = db
        .prepare(
          "SELECT description, instructions FROM soul_archive WHERE id='default-project_manager'",
        )
        .get() as { description: string; instructions: string };
      expect(parseAgentFile(rows.a5?.definition ?? '')).toMatchObject({
        ok: true,
        settings: { role: 'project_manager' },
        instructions: `${pm.description}\n\n${pm.instructions}`,
      });
      expect(pm.instructions.trim()).toBe(defaultPm().trim());

      const columns = (
        db.prepare('PRAGMA table_info(agent)').all() as { name: string }[]
      ).map((c) => c.name);
      expect(columns).not.toContain('soulId');
      expect(columns).toEqual(
        expect.arrayContaining(['role', 'definition', 'revision']),
      );
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='soul'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        db.prepare('SELECT id, role, label, body FROM role_template').all(),
      ).toEqual([
        {
          id: 'unused',
          role: 'qa',
          label: 'Unused QA',
          body: 'Unused\n\nUnused text',
        },
      ]);
      // links from other tables survive the rebuild
      expect(db.prepare('SELECT agentId FROM team_assignment').all()).toEqual([
        { agentId: 'a5' },
      ]);
      expect(db.prepare('SELECT agentId FROM usage_record').all()).toEqual([
        { agentId: 'a1' },
      ]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      db.close();
    }
  });

  it('going back restores souls and keeps edits made since', () => {
    const db = seeded();
    try {
      migrateUp(db);
      const a1 = agents(db).a1 as AgentRow;
      db.prepare('UPDATE agent SET definition=?, revision=2 WHERE id=?').run(
        a1.definition.replace('Do things.', 'Do better things.'),
        'a1',
      );
      db.prepare(
        `INSERT INTO agent(id,name,role,provider,providerConnectionId,model,definition,revision,createdAt,updatedAt)
         VALUES('a6','Eve','qa','claude','pc1','claude-sonnet-5-5',?,1,?,?)`,
      ).run(
        renderAgentFile(
          settings('Eve', 'qa', 'Work Claude', 'claude-sonnet-5-5'),
          'Test it.',
        ),
        at,
        at,
      );
      migrateDown(db, 9);

      const soulOf = (agentId: string) =>
        db
          .prepare(
            'SELECT s.id, s.name, s.roleType, s.description, s.instructions FROM agent a JOIN soul s ON s.id=a.soulId WHERE a.id=?',
          )
          .get(agentId) as {
          id: string;
          name: string;
          roleType: string;
          description: string;
          instructions: string;
        };
      expect(soulOf('a2').id).toBe('shared');
      expect(soulOf('a5').id).toBe('default-project_manager');
      expect(soulOf('a1')).toMatchObject({
        name: 'Alice (from agent file)',
        roleType: 'developer',
        description: '',
        instructions: 'Shared desc\n\n# Shared\n\nDo better things.',
      });
      expect(soulOf('a6')).toMatchObject({
        name: 'Eve (from agent file)',
        roleType: 'qa',
        instructions: 'Test it.',
      });
      expect(db.prepare("SELECT id FROM soul WHERE id='unused'").get()).toEqual(
        { id: 'unused' },
      );
      for (const table of [
        'role_template',
        'soul_archive',
        'agent_soul_archive',
      ])
        expect(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table),
        ).toBeUndefined();
      expect(db.prepare('SELECT agentId FROM team_assignment').all()).toEqual([
        { agentId: 'a5' },
      ]);
      expect(db.prepare('SELECT agentId FROM usage_record').all()).toEqual([
        { agentId: 'a1' },
      ]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      migrateUp(db);
      expect(agents(db).a6?.role).toBe('qa');
    } finally {
      db.close();
    }
  });
});
