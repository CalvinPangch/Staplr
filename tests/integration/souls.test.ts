import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { platformFixture } from './helpers';

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
});
afterEach(async () => {
  await f.close();
});

interface Soul {
  id: string;
  name: string;
  roleType: string;
  description: string;
  instructions: string;
  isDefault: boolean;
  copiedFromId: string | null;
  usedByAgents: { id: string; name: string }[];
}
const list = async () => (await f.call('GET', '/api/souls')).json() as Soul[];
const input = (extra: object = {}) => ({
  name: 'Release manager',
  roleType: 'custom',
  description: 'Coordinates releases',
  instructions: '# Release manager\nShip carefully.',
  ...extra,
});
const defaultOf = async (roleType: string) => {
  const soul = (await list()).find(
    (s) => s.isDefault && s.roleType === roleType,
  );
  if (!soul) throw new Error(`No default soul for ${roleType}`);
  return soul;
};
const actions = async () =>
  (
    (await f.call('GET', '/api/audit-entries')).json() as { action: string }[]
  ).map((a) => a.action);

describe('default souls', () => {
  it('seeds the four defaults, read-only, with working instructions', async () => {
    const souls = await list();
    const defaults = souls.filter((s) => s.isDefault);
    expect(defaults.map((s) => s.roleType).sort()).toEqual([
      'business_analyst',
      'developer',
      'project_manager',
      'qa',
    ]);
    for (const soul of defaults) {
      expect(soul.instructions.length).toBeGreaterThan(200);
      expect(soul.copiedFromId).toBeNull();
      expect(soul.usedByAgents).toEqual([]);
    }
  });

  it('the seeded text is exactly the content of the default soul files', async () => {
    const files = {
      project_manager: 'project-manager.md',
      business_analyst: 'business-analyst.md',
      developer: 'developer.md',
      qa: 'qa.md',
    } as const;
    for (const [role, file] of Object.entries(files)) {
      const text = readFileSync(
        `src/server/modules/souls/defaults/${file}`,
        'utf8',
      );
      expect((await defaultOf(role)).instructions).toBe(
        text.replace(/\r\n/g, '\n'),
      );
    }
  });

  it('the business analyst default analyses tickets, asks questions and writes the spec', async () => {
    const text = (
      await defaultOf('business_analyst')
    ).instructions.toLowerCase();
    expect(text).toContain('clarifying question');
    expect(text).toMatch(/spec|design/);
  });

  it('cannot be edited or deleted', async () => {
    const pm = await defaultOf('project_manager');
    const put = await f.call(
      'PUT',
      `/api/souls/${pm.id}`,
      input({ name: pm.name, roleType: pm.roleType }),
    );
    expect(put.statusCode).toBe(403);
    expect(put.json().code).toBe('forbidden');
    const del = await f.call('DELETE', `/api/souls/${pm.id}`);
    expect(del.statusCode).toBe(403);
    expect(await defaultOf('project_manager')).toEqual(pm);
  });
});

describe('creating souls', () => {
  it('creates a custom soul and audits it', async () => {
    const created = await f.call('POST', '/api/souls', input());
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Release manager',
      roleType: 'custom',
      isDefault: false,
      copiedFromId: null,
      usedByAgents: [],
    });
    expect(await actions()).toContain('soul.created');
  });

  it.each(['business_analyst', 'developer', 'qa', 'custom'])(
    'allows %s from scratch',
    async (roleType) => {
      const created = await f.call(
        'POST',
        '/api/souls',
        input({ name: `from scratch ${roleType}`, roleType }),
      );
      expect(created.statusCode).toBe(201);
    },
  );

  it('refuses project_manager from scratch', async () => {
    const reply = await f.call(
      'POST',
      '/api/souls',
      input({ roleType: 'project_manager' }),
    );
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('invalid_input');
    expect(reply.json().message).toMatch(/Project Manager/);
  });

  it('enforces field limits', async () => {
    const cases: [object, number][] = [
      [{ name: '' }, 422],
      [{ name: 'n'.repeat(81) }, 422],
      [{ name: 'n'.repeat(80) }, 201],
      [{ name: 'desc', description: 'd'.repeat(501) }, 422],
      [{ name: 'desc ok', description: 'd'.repeat(500) }, 201],
      [{ name: 'inst', instructions: 'i'.repeat(20_001) }, 422],
      [{ name: 'inst ok', instructions: 'i'.repeat(20_000) }, 201],
      [{ name: 'bad role', roleType: 'manager' }, 422],
      [{ name: 'extra', surprise: true }, 422],
    ];
    for (const [extra, status] of cases)
      expect(
        (await f.call('POST', '/api/souls', input(extra))).statusCode,
        JSON.stringify(extra).slice(0, 60),
      ).toBe(status);
  });

  it('keeps names unique regardless of case', async () => {
    await f.call('POST', '/api/souls', input());
    const duplicate = await f.call(
      'POST',
      '/api/souls',
      input({ name: 'RELEASE MANAGER' }),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('conflict');
    const clash = await f.call(
      'POST',
      '/api/souls',
      input({ name: 'developer' }),
    );
    expect(clash.statusCode).toBe(409);
  });
});

describe('copying souls', () => {
  it('copies a default keeping its role type and recording the source', async () => {
    const developer = await defaultOf('developer');
    const copy = await f.call('POST', `/api/souls/${developer.id}/copy`, {
      name: 'Careful developer',
    });
    expect(copy.statusCode).toBe(201);
    expect(copy.json()).toMatchObject({
      name: 'Careful developer',
      roleType: 'developer',
      isDefault: false,
      copiedFromId: developer.id,
      instructions: developer.instructions,
    });
    expect(await actions()).toContain('soul.copied');
  });

  it('copies the Project Manager default as a Project Manager', async () => {
    const pm = await defaultOf('project_manager');
    const copy = await f.call('POST', `/api/souls/${pm.id}/copy`, {});
    expect(copy.statusCode).toBe(201);
    expect(copy.json().roleType).toBe('project_manager');
    expect(copy.json().name).toBe(`Copy of ${pm.name}`);
  });

  it('numbers default copy names so they stay unique', async () => {
    const qa = await defaultOf('qa');
    const first = await f.call('POST', `/api/souls/${qa.id}/copy`, {});
    const second = await f.call('POST', `/api/souls/${qa.id}/copy`);
    expect(first.json().name).toBe(`Copy of ${qa.name}`);
    expect(second.json().name).toBe(`Copy of ${qa.name} (2)`);
  });

  it('refuses an explicit name that is taken and a missing source', async () => {
    const qa = await defaultOf('qa');
    expect(
      (await f.call('POST', `/api/souls/${qa.id}/copy`, { name: qa.name }))
        .statusCode,
    ).toBe(409);
    expect(
      (await f.call('POST', '/api/souls/missing/copy', {})).statusCode,
    ).toBe(404);
  });
});

describe('editing and deleting custom souls', () => {
  it('edits a custom soul and audits it', async () => {
    const id = (await f.call('POST', '/api/souls', input())).json()
      .id as string;
    const updated = await f.call(
      'PUT',
      `/api/souls/${id}`,
      input({
        name: 'Release lead',
        description: 'New',
        instructions: 'New text',
      }),
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: 'Release lead',
      description: 'New',
      instructions: 'New text',
      usedByAgents: [],
    });
    expect(await actions()).toContain('soul.updated');
  });

  it('does not let the role type change', async () => {
    const id = (await f.call('POST', '/api/souls', input())).json()
      .id as string;
    const reply = await f.call(
      'PUT',
      `/api/souls/${id}`,
      input({ roleType: 'developer' }),
    );
    expect(reply.statusCode).toBe(422);
    expect(reply.json().message).toMatch(/role type/i);
    expect((await list()).find((s) => s.id === id)?.roleType).toBe('custom');
  });

  it('keeps a soul unchanged when its new name is taken', async () => {
    const id = (await f.call('POST', '/api/souls', input())).json()
      .id as string;
    const reply = await f.call(
      'PUT',
      `/api/souls/${id}`,
      input({ name: 'Developer' }),
    );
    expect(reply.statusCode).toBe(409);
  });

  it('deletes a custom soul and audits it', async () => {
    const id = (await f.call('POST', '/api/souls', input())).json()
      .id as string;
    expect((await f.call('DELETE', `/api/souls/${id}`)).statusCode).toBe(204);
    expect((await f.call('GET', `/api/souls/${id}`)).statusCode).toBe(404);
    expect(await actions()).toContain('soul.deleted');
  });

  it('answers 404 for unknown souls', async () => {
    expect((await f.call('GET', '/api/souls/nope')).statusCode).toBe(404);
    expect((await f.call('PUT', '/api/souls/nope', input())).statusCode).toBe(
      404,
    );
    expect((await f.call('DELETE', '/api/souls/nope')).statusCode).toBe(404);
  });
});

describe('access', () => {
  it('needs a session', async () => {
    const reply = await f.app.inject({ method: 'GET', url: '/api/souls' });
    expect(reply.statusCode).toBe(401);
  });
});
