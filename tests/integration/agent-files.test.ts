import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { platformFixture } from './helpers';
import { dumpPlaintext } from './no-plaintext-secrets.test';
import {
  parseAgentFile,
  renderAgentFile,
  setHeaderValue,
  type AgentSettings,
} from '../../src/shared/agent-file';

/**
 * Feature 003: an agent is one Markdown file (settings header + instructions)
 * and the separate soul is gone.
 */
let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
});
afterEach(async () => {
  await f.close();
});

const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
async function claude(name = 'Work Claude', key = 'sk-ant-files-1') {
  f.anthropic.setKey(key, { models });
  const reply = await f.call('POST', '/api/provider-connections', {
    provider: 'claude',
    authType: 'api_key',
    name,
    apiKey: key,
  });
  expect(reply.statusCode).toBe(201);
  return reply.json().id as string;
}
const settings = (extra: Partial<AgentSettings> = {}): AgentSettings => ({
  name: 'Dev Agent',
  role: 'developer',
  provider: 'claude',
  connection: 'Work Claude',
  model: 'claude-sonnet-5-5',
  ...extra,
});
const file = (
  extra: Partial<AgentSettings> = {},
  body = 'Write tests first.',
) => renderAgentFile(settings(extra), body);
const create = (definition: string) =>
  f.call('POST', '/api/agents', { definition });
const problemsOf = (reply: { json(): unknown }) =>
  (
    reply.json() as {
      details: { problems: { line: number; field: string; message: string }[] };
    }
  ).details.problems;

describe('role templates', () => {
  it('offers the four shipped roles as ready files', async () => {
    const reply = await f.call('GET', '/api/agent-templates');
    expect(reply.statusCode).toBe(200);
    const templates = reply.json().templates as {
      id: string;
      role: string;
      label: string;
      kind: string;
      definition: string;
    }[];
    expect(templates.map((t) => [t.role, t.label, t.kind])).toEqual([
      ['project_manager', 'Project Manager', 'shipped'],
      ['business_analyst', 'Business Analyst', 'shipped'],
      ['developer', 'Developer', 'shipped'],
      ['qa', 'QA', 'shipped'],
    ]);
    const developer = templates.find((t) => t.role === 'developer');
    // the header is complete in shape, so only the empty name is a problem
    const parsed = parseAgentFile(developer?.definition ?? '');
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.problems.map((p) => p.field)).toEqual(['name']);
    const filled = parseAgentFile(
      setHeaderValue(developer?.definition ?? '', 'name', 'x'),
    );
    expect(filled).toMatchObject({
      ok: true,
      settings: {
        role: 'developer',
        provider: 'claude',
        connection: '',
        model: '',
      },
      instructions: readFileSync(
        'src/server/modules/agents/templates/developer.md',
        'utf8',
      ),
    });
  });
});

describe('creating an agent from its file', () => {
  it('stores the file exactly and reads its settings', async () => {
    const connection = await claude();
    const definition = file({}, '# Dev\r\n\r\nKeep   spacing.  \n');
    const reply = await create(definition);
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      name: 'Dev Agent',
      role: 'developer',
      provider: 'claude',
      providerConnectionId: connection,
      connectionName: 'Work Claude',
      model: 'claude-sonnet-5-5',
      revision: 1,
      readiness: 'ready',
      definition,
    });
    const again = await f.call('GET', `/api/agents/${reply.json().id}`);
    expect(again.json().definition).toBe(definition);
  });

  it('saves an agent with no connection or model yet, as Not ready', async () => {
    await claude();
    const reply = await create(file({ connection: '', model: '' }));
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      providerConnectionId: null,
      connectionName: null,
      model: null,
      readiness: 'not_ready',
    });
    expect(reply.json().reasons.map((r: { code: string }) => r.code)).toContain(
      'no_provider_connection',
    );
  });

  it('lists every problem together with its line and stores nothing', async () => {
    await claude();
    expect((await create(file({ name: 'Taken' }))).statusCode).toBe(201);
    const definition = file({
      name: 'taken',
      connection: 'Nobody',
    }).replace('role: developer', 'role: dev');
    const reply = await create(definition);
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('agent_file_invalid');
    expect(reply.json().message).toMatch(/problem/);
    // the shape problem is found first; server checks only run on a readable file
    expect(problemsOf(reply)).toEqual([
      expect.objectContaining({ line: 3, field: 'role' }),
    ]);
    const second = await create(file({ name: 'taken', connection: 'Nobody' }));
    expect(problemsOf(second)).toEqual([
      expect.objectContaining({ line: 2, field: 'name' }),
      expect.objectContaining({ line: 5, field: 'connection' }),
    ]);
    expect(
      (await f.call('GET', '/api/agents')).json() as unknown[],
    ).toHaveLength(1);
  });

  it('refuses a model that is not verified for the connection', async () => {
    await claude();
    const reply = await create(file({ model: 'claude-opus-5-5' }));
    expect(reply.statusCode).toBe(422);
    expect(problemsOf(reply)).toEqual([
      expect.objectContaining({ line: 6, field: 'model' }),
    ]);
    expect(problemsOf(reply)[0]?.message).toMatch(
      /Check availability|not available/,
    );
  });

  it('names a connection of the other provider as unknown', async () => {
    await claude();
    const reply = await create(file({ provider: 'codex', model: '' }));
    expect(problemsOf(reply)).toEqual([
      expect.objectContaining({ line: 5, field: 'connection' }),
    ]);
  });

  it('records the creation without the file text', async () => {
    await claude();
    await create(file({}, 'A very particular sentence.'));
    const audit = (await f.call('GET', '/api/audit-entries')).body;
    expect(audit).toContain('agent.created');
    expect(audit).not.toContain('very particular sentence');
  });

  it('keeps no secrets in replies or the database', async () => {
    await claude();
    const reply = await create(file());
    expect(reply.body).not.toContain('sk-ant-files-1');
    expect(dumpPlaintext(f.db)).not.toContain('sk-ant-files-1');
  });
});

describe('souls are gone', () => {
  it('answers 404 for the soul endpoints', async () => {
    expect((await f.call('GET', '/api/souls')).statusCode).toBe(404);
    expect(
      (await f.call('GET', '/api/souls/default-developer')).statusCode,
    ).toBe(404);
  });
});

describe('editing an agent file (US2)', () => {
  async function saved(extra: Partial<AgentSettings> = {}, body?: string) {
    const reply = await create(file(extra, body));
    expect(reply.statusCode).toBe(201);
    return reply.json() as { id: string; definition: string; revision: number };
  }
  const put = (id: string, definition: string, revision: number) =>
    f.call('PUT', `/api/agents/${id}`, { definition, revision });

  it('stores an edit exactly and counts the revision up', async () => {
    await claude();
    const agent = await saved();
    const edited = agent.definition.replace(
      'Write tests first.',
      'Write tests first.\r\n\r\n- then code  ',
    );
    const reply = await put(agent.id, edited, 1);
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toMatchObject({ definition: edited, revision: 2 });
  });

  it('refuses a save based on an older version and changes nothing', async () => {
    await claude();
    const agent = await saved();
    const first = agent.definition.replace('first', 'early');
    expect((await put(agent.id, first, 1)).statusCode).toBe(200);
    const stale = await put(
      agent.id,
      agent.definition.replace('first', 'late'),
      1,
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'agent_changed',
      details: { revision: 2 },
    });
    expect(stale.json().message).toMatch(/changed somewhere else/);
    expect(
      (await f.call('GET', `/api/agents/${agent.id}`)).json(),
    ).toMatchObject({ definition: first, revision: 2 });
  });

  it('edits one agent without touching another made from the same template', async () => {
    await claude();
    const one = await saved({ name: 'One' });
    const two = await saved({ name: 'Two' });
    await put(one.id, one.definition.replace('first', 'never'), 1);
    expect(
      (await f.call('GET', `/api/agents/${two.id}`)).json().definition,
    ).toBe(two.definition);
  });

  it('applies a new model and keeps the instructions when the role changes', async () => {
    await claude();
    const agent = await saved();
    const changed = setHeaderValue(
      setHeaderValue(agent.definition, 'model', 'claude-haiku-5-5'),
      'role',
      'qa',
    );
    const reply = await put(agent.id, changed, 1);
    expect(reply.json()).toMatchObject({
      model: 'claude-haiku-5-5',
      role: 'qa',
      readiness: 'ready',
    });
    expect(parseAgentFile(reply.json().definition)).toMatchObject({
      instructions: 'Write tests first.',
    });
  });

  it('refuses a file over 20,000 characters and keeps the last version', async () => {
    await claude();
    const agent = await saved();
    const reply = await put(agent.id, agent.definition + 'x'.repeat(20_000), 1);
    expect(reply.statusCode).toBe(422);
    expect(
      (await f.call('GET', `/api/agents/${agent.id}`)).json().revision,
    ).toBe(1);
  });

  it('records which settings changed, never the text', async () => {
    await claude();
    const agent = await saved();
    await put(
      agent.id,
      setHeaderValue(agent.definition, 'model', 'claude-haiku-5-5').replace(
        'Write tests first.',
        'A secret-ish sentence.',
      ),
      1,
    );
    const updated = (
      f.db
        .prepare("SELECT detail FROM audit_entry WHERE action='agent.updated'")
        .all() as { detail: string }[]
    ).map((r) => JSON.parse(r.detail));
    expect(updated).toEqual([{ changed: ['model', 'instructions'] }]);
    expect((await f.call('GET', '/api/audit-entries')).body).not.toContain(
      'secret-ish',
    );
  });

  it('follows a renamed connection in every file that uses it', async () => {
    const connection = await claude();
    const one = await saved({ name: 'One' });
    const two = await saved({ name: 'Two' });
    const renamed = await f.call(
      'PATCH',
      `/api/provider-connections/${connection}`,
      { name: 'Claude Main' },
    );
    expect(renamed.statusCode).toBe(200);
    for (const agent of [one, two]) {
      const now = (await f.call('GET', `/api/agents/${agent.id}`)).json();
      expect(now.definition).toBe(
        agent.definition.replace(
          'connection: Work Claude',
          'connection: Claude Main',
        ),
      );
      expect(now).toMatchObject({ revision: 2, readiness: 'ready' });
    }
    const updated = (
      f.db
        .prepare("SELECT detail FROM audit_entry WHERE action='agent.updated'")
        .all() as { detail: string }[]
    ).map((r) => JSON.parse(r.detail));
    expect(updated).toEqual([
      { changed: ['connection'] },
      { changed: ['connection'] },
    ]);
  });

  it('keeps a removed connection named in the file and says it was not found', async () => {
    const connection = await claude();
    const agent = await saved();
    await f.call('DELETE', `/api/provider-connections/${connection}`);
    const now = (await f.call('GET', `/api/agents/${agent.id}`)).json();
    expect(now).toMatchObject({
      providerConnectionId: null,
      connectionName: 'Work Claude',
      readiness: 'not_ready',
      definition: agent.definition,
    });
    expect(now.reasons[0].message).toMatch(/"Work Claude" was not found/);
  });
});

describe('the Project Manager role (US4)', () => {
  it('can be given to any agent created from any template', async () => {
    await claude();
    const reply = await create(file({ role: 'project_manager' }));
    expect(reply.statusCode).toBe(201);
    expect(reply.json().role).toBe('project_manager');
  });
});
