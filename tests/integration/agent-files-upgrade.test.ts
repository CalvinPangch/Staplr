import { it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { platformFixture } from './helpers';
import { sealToBlob } from '../../src/server/lib/crypto';
import { catalogRevision } from '../../src/server/modules/prices/catalog';
import { parseAgentFile } from '../../src/shared/agent-file';

/**
 * Feature 003, US3 (SC-002): an installation from before this feature is
 * upgraded, and every agent keeps its role, its text, its teams and its
 * readiness; a custom soul no agent used is offered as a template.
 */
const at = '2026-11-01T00:00:00.000Z';
const masterKey = Buffer.alloc(32, 1); // the fixture's STAPLR_MASTER_KEY

function seedOlderRelease(db: Database.Database) {
  const run = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args);
  run(
    `INSERT INTO provider_connection(id,provider,name,authType,apiKeySealed,status,createdAt,updatedAt)
     VALUES('pc1','claude','Work Claude','api_key',?,'connected',?,?)`,
    sealToBlob(Buffer.from('sk-ant-upgrade', 'utf8'), masterKey),
    at,
    at,
  );
  run(
    `INSERT INTO model_access(providerConnectionId,model,credentialRevision,catalogRevision,availability,lastVerifiedAt,lastAttemptAt)
     VALUES('pc1','claude-sonnet-5-5',1,?,'available',?,?)`,
    catalogRevision(),
    at,
    at,
  );
  const soul = db.prepare(
    `INSERT INTO soul(id,name,roleType,description,instructions,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,0,?,?)`,
  );
  soul.run(
    'shared',
    'Careful Dev',
    'developer',
    'Edited by the owner.',
    '# Careful\n\nSmall steps.',
    at,
    at,
  );
  soul.run('unused', 'Unused QA', 'qa', '', 'Check everything twice.', at, at);
  const agent = db.prepare(
    `INSERT INTO agent(id,name,soulId,provider,providerConnectionId,model,createdAt,updatedAt)
     VALUES(?,?,?,'claude','pc1','claude-sonnet-5-5',?,?)`,
  );
  agent.run('alice', 'Alice', 'shared', at, at);
  agent.run('bob', 'Bob', 'shared', at, at);
  agent.run('pam', 'Pam', 'default-project_manager', at, at);
  const project = db.prepare(
    `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
     VALUES(?,?,?,?,'main','downloaded',?,?)`,
  );
  project.run('p1', 'Shop', 'o/shop', '1', at, at);
  project.run('p2', 'Blog', 'o/blog', '2', at, at);
  const member = db.prepare(
    'INSERT INTO team_assignment(projectId,agentId,assignedAt) VALUES(?,?,?)',
  );
  member.run('p1', 'pam', at);
  member.run('p1', 'alice', at);
  member.run('p2', 'pam', at);
}

it('keeps every agent working after the upgrade (SC-002)', async () => {
  const f = await platformFixture({ beforeUpgrade: seedOlderRelease });
  try {
    f.anthropic.setKey('sk-ant-upgrade', { models: ['claude-sonnet-5-5'] });
    const agents = Object.fromEntries(
      (
        (await f.call('GET', '/api/agents')).json() as {
          id: string;
          role: string;
          readiness: string;
          definition: string;
          projects: { id: string }[];
        }[]
      ).map((a) => [a.id, a]),
    );
    expect(agents.alice).toMatchObject({
      role: 'developer',
      readiness: 'ready',
    });
    expect(agents.bob).toMatchObject({ role: 'developer', readiness: 'ready' });
    expect(agents.pam).toMatchObject({
      role: 'project_manager',
      readiness: 'ready',
    });
    // teams and their Project Manager are unchanged
    expect(agents.alice?.projects.map((p) => p.id)).toEqual(['p1']);
    expect(agents.pam?.projects.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    // the soul's text, character for character, in each agent's own file
    for (const id of ['alice', 'bob'])
      expect(parseAgentFile(agents[id]?.definition ?? '')).toMatchObject({
        ok: true,
        instructions: 'Edited by the owner.\n\n# Careful\n\nSmall steps.',
      });
    const templates = (await f.call('GET', '/api/agent-templates')).json()
      .templates as { label: string; kind: string; role: string }[];
    expect(templates).toContainEqual(
      expect.objectContaining({ label: 'Unused QA', kind: 'kept', role: 'qa' }),
    );
  } finally {
    await f.close();
  }
});
