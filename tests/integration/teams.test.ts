import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformFixture } from './helpers';
import { createGitRemote, type GitRemote } from '../fakes/git-remote';
import { agentBody, agentChange, type AgentSpec } from './agent-helpers';

let f: Awaited<ReturnType<typeof platformFixture>>;
let remote: GitRemote;
const token = 'ghp_teamsTokenValue0001';
const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];

beforeEach(async () => {
  connectionId = '';
  f = await platformFixture();
  remote = await createGitRemote(['main']);
  f.fake.github.setToken(token, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    repos: [
      {
        id: 21,
        fullName: 'octo/app',
        defaultBranch: 'main',
        branches: ['main'],
        cloneUrl: remote.url,
      },
      {
        id: 22,
        fullName: 'octo/second',
        defaultBranch: 'main',
        branches: ['main'],
        cloneUrl: remote.url,
      },
    ],
  });
});
afterEach(async () => {
  await f.close();
  await remote.close();
});

interface Team {
  members: { id: string; name: string; role: string; readiness: string }[];
  projectManagerId: string | null;
  missingRoleWarnings: string[];
}
interface Project {
  id: string;
  readiness: string;
  reasons: { code: string; agentId?: string }[];
}

let connectionId = '';
async function providerConnection() {
  if (!connectionId) {
    f.anthropic.setKey('sk-ant-teams-1', { models });
    connectionId = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-teams-1',
      })
    ).json().id as string;
  }
  return connectionId;
}
async function agent(name: string, role: AgentSpec['role']) {
  const reply = await f.call(
    'POST',
    '/api/agents',
    await agentBody(f, {
      name,
      role,
      provider: 'claude',
      providerConnectionId: await providerConnection(),
      model: 'claude-sonnet-5-5',
    }),
  );
  expect(reply.statusCode).toBe(201);
  return reply.json().id as string;
}
async function project(repoRemoteId = '21') {
  const connection = (await f.call('GET', '/api/source-control-connections'))
    .json()
    .at(0)?.id as string | undefined;
  const sc =
    connection ??
    ((
      await f.call('POST', '/api/source-control-connections', {
        name: 'gh',
        platform: 'github',
        token,
      })
    ).json().id as string);
  const created = await f.call('POST', '/api/projects', {
    sourceControlConnectionId: sc,
    repoRemoteId,
  });
  expect(created.statusCode).toBe(202);
  await f.app.projects.whenIdle();
  return created.json().id as string;
}
const team = async (id: string) =>
  (await f.call('GET', `/api/projects/${id}/team`)).json() as Team;
const assign = (projectId: string, agentId: string) =>
  f.call('PUT', `/api/projects/${projectId}/team/${agentId}`);
const getProject = async (id: string) =>
  (await f.call('GET', `/api/projects/${id}`)).json() as Project;

describe('building a team', () => {
  it('starts empty with a warning for every missing role', async () => {
    const id = await project();
    expect(await team(id)).toEqual({
      members: [],
      projectManagerId: null,
      missingRoleWarnings: ['business_analyst', 'developer', 'qa'],
    });
  });

  it('assigns agents, shows readiness and warns only about absent roles', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    const dev = await agent('Dee', 'developer');
    expect((await assign(id, pm)).statusCode).toBe(200);
    const reply = await assign(id, dev);
    expect(reply.statusCode).toBe(200);
    const t = reply.json() as Team;
    expect(t.projectManagerId).toBe(pm);
    expect(t.members.map((m) => m.name).sort()).toEqual(['Dee', 'Pat']);
    expect(t.members.every((m) => m.readiness === 'ready')).toBe(true);
    expect(t.missingRoleWarnings).toEqual(['business_analyst', 'qa']);
    expect(await team(id)).toEqual(t);
  });

  it('is idempotent when the agent is already on the team', async () => {
    const id = await project();
    const dev = await agent('Dee', 'developer');
    await assign(id, dev);
    const again = await assign(id, dev);
    expect(again.statusCode).toBe(200);
    expect((again.json() as Team).members).toHaveLength(1);
  });

  it('blocks a second Project Manager', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    const second = await agent('Pam', 'project_manager');
    await assign(id, pm);
    const blocked = await assign(id, second);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('pm_already_assigned');
    expect((await team(id)).projectManagerId).toBe(pm);
  });

  it('replaces the Project Manager in one step', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    const second = await agent('Pam', 'project_manager');
    const dev = await agent('Dee', 'developer');
    await assign(id, pm);
    await assign(id, dev);
    const swapped = await f.call(
      'POST',
      `/api/projects/${id}/team/replace-project-manager`,
      { agentId: second },
    );
    expect(swapped.statusCode).toBe(200);
    const t = swapped.json() as Team;
    expect(t.projectManagerId).toBe(second);
    expect(t.members.map((m) => m.name).sort()).toEqual(['Dee', 'Pam']);
  });

  it('only replaces with a Project Manager agent that exists', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    const dev = await agent('Dee', 'developer');
    await assign(id, pm);
    const notPm = await f.call(
      'POST',
      `/api/projects/${id}/team/replace-project-manager`,
      { agentId: dev },
    );
    expect(notPm.statusCode).toBe(422);
    const missing = await f.call(
      'POST',
      `/api/projects/${id}/team/replace-project-manager`,
      { agentId: 'nope' },
    );
    expect(missing.statusCode).toBe(404);
    expect((await team(id)).projectManagerId).toBe(pm);
  });

  it('removes a member', async () => {
    const id = await project();
    const dev = await agent('Dee', 'developer');
    await assign(id, dev);
    const removed = await f.call('DELETE', `/api/projects/${id}/team/${dev}`);
    expect(removed.statusCode).toBe(200);
    expect((removed.json() as Team).members).toEqual([]);
  });

  it('lets one agent serve on several projects', async () => {
    const first = await project('21');
    const second = await project('22');
    const dev = await agent('Dee', 'developer');
    await assign(first, dev);
    await assign(second, dev);
    expect((await team(first)).members).toHaveLength(1);
    expect((await team(second)).members).toHaveLength(1);
    const listed = (await f.call('GET', `/api/agents/${dev}`)).json() as {
      projects: { id: string }[];
    };
    expect(listed.projects.map((p) => p.id).sort()).toEqual(
      [first, second].sort(),
    );
  });

  it('answers 404 for unknown projects and agents', async () => {
    const id = await project();
    expect((await assign('nope', 'nope')).statusCode).toBe(404);
    expect((await assign(id, 'nope')).statusCode).toBe(404);
    expect((await f.call('GET', '/api/projects/nope/team')).statusCode).toBe(
      404,
    );
  });
});

describe('finishing setup', () => {
  it('needs a Project Manager', async () => {
    const id = await project();
    const dev = await agent('Dee', 'developer');
    await assign(id, dev);
    const refused = await f.call('POST', `/api/projects/${id}/finalize-team`);
    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe('no_project_manager');
    await assign(id, await agent('Pat', 'project_manager'));
    const done = await f.call('POST', `/api/projects/${id}/finalize-team`);
    expect(done.statusCode).toBe(200);
    expect(done.json().id).toBe(id);
  });
});

describe('project readiness', () => {
  it('is Ready with a downloaded repository, one PM and ready agents', async () => {
    const id = await project();
    await assign(id, await agent('Pat', 'project_manager'));
    await assign(id, await agent('Dee', 'developer'));
    await assign(id, await agent('Bea', 'business_analyst'));
    await assign(id, await agent('Quinn', 'qa'));
    const p = await getProject(id);
    expect(p).toMatchObject({ readiness: 'ready', reasons: [] });
  });

  it('is Not ready without a Project Manager and again after removing it', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    expect((await getProject(id)).reasons.map((r) => r.code)).toContain(
      'no_project_manager',
    );
    await assign(id, pm);
    expect((await getProject(id)).readiness).toBe('ready');
    await f.call('DELETE', `/api/projects/${id}/team/${pm}`);
    const p = await getProject(id);
    expect(p.readiness).toBe('not_ready');
    expect(p.reasons.map((r) => r.code)).toContain('no_project_manager');
  });

  it('names a team member that is not ready', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    await assign(id, pm);
    f.anthropic.setKey('sk-ant-teams-1', { models: [], reject: true });
    await f.call('POST', `/api/provider-connections/${connectionId}/check`);
    const p = await getProject(id);
    expect(p.readiness).toBe('not_ready');
    expect(p.reasons).toContainEqual(
      expect.objectContaining({ code: 'agent_not_ready', agentId: pm }),
    );
  });
});

describe('guards on agents', () => {
  it('blocks deleting an agent that is on a team and names the projects', async () => {
    const id = await project();
    const dev = await agent('Dee', 'developer');
    await assign(id, dev);
    const blocked = await f.call('DELETE', `/api/agents/${dev}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('agent_in_use');
    expect(blocked.json().details.projects).toEqual([{ id, name: 'app' }]);
    await f.call('DELETE', `/api/projects/${id}/team/${dev}`);
    expect((await f.call('DELETE', `/api/agents/${dev}`)).statusCode).toBe(204);
  });

  /** The single problem on the role line of a refused agent file (feature 003, US4). */
  const roleProblem = (reply: { json(): unknown }) =>
    (
      reply.json() as {
        details: {
          problems: { line: number; field: string; message: string }[];
        };
      }
    ).details.problems.find((p) => p.field === 'role');

  it('blocks a role change that would leave a project without a Project Manager', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    await assign(id, pm);
    const blocked = await f.call(
      'PUT',
      `/api/agents/${pm}`,
      await agentChange(f, pm, { role: 'developer' }),
    );
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().code).toBe('agent_file_invalid');
    expect(roleProblem(blocked)).toMatchObject({ line: 3 });
    expect(roleProblem(blocked)?.message).toMatch(/app/);
    expect((await f.call('GET', `/api/agents/${pm}`)).json().role).toBe(
      'project_manager',
    );
  });

  it('blocks a role change that would give a project two Project Managers', async () => {
    const id = await project();
    const pm = await agent('Pat', 'project_manager');
    const dev = await agent('Dee', 'developer');
    await assign(id, pm);
    await assign(id, dev);
    const blocked = await f.call(
      'PUT',
      `/api/agents/${dev}`,
      await agentChange(f, dev, { role: 'project_manager' }),
    );
    expect(blocked.statusCode).toBe(422);
    expect(roleProblem(blocked)?.message).toMatch(/app/);
  });

  it('allows a role change on an agent that is on no team', async () => {
    const dev = await agent('Dee', 'developer');
    const changed = await f.call(
      'PUT',
      `/api/agents/${dev}`,
      await agentChange(f, dev, { role: 'project_manager' }),
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json().role).toBe('project_manager');
  });
});
