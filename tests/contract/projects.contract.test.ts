import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { createGitRemote } from '../fakes/git-remote';
import { validateResponse } from './harness';

const problem = 'application/problem+json';

it('every project, team and repository response matches the contract', async () => {
  const f = await platformFixture();
  const remote = await createGitRemote(['main', 'release']);
  try {
    f.fake.github.setToken('ghp_contractProjects01', {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      repos: [
        {
          id: 41,
          fullName: 'octo/app',
          defaultBranch: 'main',
          branches: ['main', 'release'],
          cloneUrl: remote.url,
        },
      ],
    });
    const connection = (
      await f.call('POST', '/api/source-control-connections', {
        name: 'gh',
        platform: 'github',
        token: 'ghp_contractProjects01',
      })
    ).json().id as string;

    const repos = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories`,
    );
    validateResponse(
      '/api/source-control-connections/{id}/repositories',
      'get',
      200,
      repos.json(),
    );
    const branches = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories/41/branches`,
    );
    validateResponse(
      '/api/source-control-connections/{id}/repositories/{repoRemoteId}/branches',
      'get',
      200,
      branches.json(),
    );
    const noConnection = await f.call(
      'GET',
      '/api/source-control-connections/nope/repositories',
    );
    expect(noConnection.statusCode).toBe(404);
    validateResponse(
      '/api/source-control-connections/{id}/repositories',
      'get',
      404,
      noConnection.json(),
      problem,
    );
    const noRepo = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories/9/branches`,
    );
    expect(noRepo.statusCode).toBe(404);
    validateResponse(
      '/api/source-control-connections/{id}/repositories/{repoRemoteId}/branches',
      'get',
      404,
      noRepo.json(),
      problem,
    );

    const created = await f.call('POST', '/api/projects', {
      sourceControlConnectionId: connection,
      repoRemoteId: '41',
    });
    expect(created.statusCode).toBe(202);
    validateResponse('/api/projects', 'post', 202, created.json());
    const id = created.json().id as string;
    await f.app.projects.whenIdle();

    validateResponse(
      '/api/projects',
      'get',
      200,
      (await f.call('GET', '/api/projects')).json(),
    );
    const got = await f.call('GET', `/api/projects/${id}`);
    validateResponse('/api/projects/{id}', 'get', 200, got.json());
    expect(got.json().downloadStatus).toBe('downloaded');

    const patched = await f.call('PATCH', `/api/projects/${id}`, {
      baseBranch: 'release',
    });
    expect(patched.statusCode).toBe(200);
    validateResponse('/api/projects/{id}', 'patch', 200, patched.json());
    const badPatch = await f.call('PATCH', `/api/projects/${id}`, {
      baseBranch: 'nope',
    });
    expect(badPatch.statusCode).toBe(422);
    validateResponse(
      '/api/projects/{id}',
      'patch',
      422,
      badPatch.json(),
      problem,
    );
    const patchMissing = await f.call('PATCH', '/api/projects/nope', {
      name: 'x',
    });
    expect(patchMissing.statusCode).toBe(404);
    validateResponse(
      '/api/projects/{id}',
      'patch',
      404,
      patchMissing.json(),
      problem,
    );

    const refreshed = await f.call('POST', `/api/projects/${id}/refresh`);
    expect(refreshed.statusCode).toBe(200);
    validateResponse(
      '/api/projects/{id}/refresh',
      'post',
      200,
      refreshed.json(),
    );
    await remote.rewrite('release');
    const rewritten = await f.call('POST', `/api/projects/${id}/refresh`);
    expect(rewritten.statusCode).toBe(409);
    validateResponse(
      '/api/projects/{id}/refresh',
      'post',
      409,
      rewritten.json(),
      problem,
    );
    const notFailed = await f.call('POST', `/api/projects/${id}/download`);
    expect(notFailed.statusCode).toBe(409);
    validateResponse(
      '/api/projects/{id}/download',
      'post',
      409,
      notFailed.json(),
      problem,
    );

    const team = await f.call('GET', `/api/projects/${id}/team`);
    validateResponse('/api/projects/{id}/team', 'get', 200, team.json());

    f.anthropic.setKey('sk-ant-contract-team', {
      models: ['claude-sonnet-5-5'],
    });
    const provider = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-contract-team',
      })
    ).json().id as string;
    const souls = (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[];
    const makeAgent = async (name: string, role: string) =>
      (
        await f.call('POST', '/api/agents', {
          name,
          soulId: souls.find((s) => s.isDefault && s.roleType === role)?.id,
          provider: 'claude',
          providerConnectionId: provider,
          model: 'claude-sonnet-5-5',
        })
      ).json().id as string;
    const pm = await makeAgent('Pat', 'project_manager');
    const pm2 = await makeAgent('Pam', 'project_manager');

    const noPm = await f.call('POST', `/api/projects/${id}/finalize-team`);
    expect(noPm.statusCode).toBe(422);
    validateResponse(
      '/api/projects/{id}/finalize-team',
      'post',
      422,
      noPm.json(),
      problem,
    );
    const assigned = await f.call('PUT', `/api/projects/${id}/team/${pm}`);
    expect(assigned.statusCode).toBe(200);
    validateResponse(
      '/api/projects/{id}/team/{agentId}',
      'put',
      200,
      assigned.json(),
    );
    const second = await f.call('PUT', `/api/projects/${id}/team/${pm2}`);
    expect(second.statusCode).toBe(409);
    validateResponse(
      '/api/projects/{id}/team/{agentId}',
      'put',
      409,
      second.json(),
      problem,
    );
    const missingAgent = await f.call('PUT', `/api/projects/${id}/team/nope`);
    expect(missingAgent.statusCode).toBe(404);
    validateResponse(
      '/api/projects/{id}/team/{agentId}',
      'put',
      404,
      missingAgent.json(),
      problem,
    );
    const swapped = await f.call(
      'POST',
      `/api/projects/${id}/team/replace-project-manager`,
      { agentId: pm2 },
    );
    expect(swapped.statusCode).toBe(200);
    validateResponse(
      '/api/projects/{id}/team/replace-project-manager',
      'post',
      200,
      swapped.json(),
    );
    const finalized = await f.call('POST', `/api/projects/${id}/finalize-team`);
    expect(finalized.statusCode).toBe(200);
    validateResponse(
      '/api/projects/{id}/finalize-team',
      'post',
      200,
      finalized.json(),
    );
    const removedMember = await f.call(
      'DELETE',
      `/api/projects/${id}/team/${pm2}`,
    );
    validateResponse(
      '/api/projects/{id}/team/{agentId}',
      'delete',
      200,
      removedMember.json(),
    );

    const removed = await f.call('DELETE', `/api/projects/${id}`);
    expect(removed.statusCode).toBe(204);
    validateResponse('/api/projects/{id}', 'delete', 204, undefined);
    const gone = await f.call('DELETE', `/api/projects/${id}`);
    expect(gone.statusCode).toBe(404);
    validateResponse('/api/projects/{id}', 'delete', 404, gone.json(), problem);

    const noSource = await f.call('POST', '/api/projects', {
      sourceControlConnectionId: 'nope',
      repoRemoteId: '41',
    });
    expect(noSource.statusCode).toBe(404);
    validateResponse('/api/projects', 'post', 404, noSource.json(), problem);
    const badRepo = await f.call('POST', '/api/projects', {
      sourceControlConnectionId: connection,
      repoRemoteId: '999',
    });
    expect(badRepo.statusCode).toBe(422);
    validateResponse('/api/projects', 'post', 422, badRepo.json(), problem);
  } finally {
    await f.close();
    await remote.close();
  }
});
