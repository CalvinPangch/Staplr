import { it, expect } from 'vitest';
import { platformFixture } from './helpers';

it('refuses to send a token to a clone address on another host', async () => {
  const f = await platformFixture();
  try {
    f.fake.github.setToken('ghp_egressCloneToken01', {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      repos: [
        {
          id: 51,
          fullName: 'octo/app',
          defaultBranch: 'main',
          cloneUrl: 'https://evil.example/octo/app.git',
        },
      ],
    });
    const connection = (
      await f.call('POST', '/api/source-control-connections', {
        name: 'gh',
        platform: 'github',
        token: 'ghp_egressCloneToken01',
      })
    ).json().id as string;
    const created = await f.call('POST', '/api/projects', {
      sourceControlConnectionId: connection,
      repoRemoteId: '51',
    });
    await f.app.projects.whenIdle();
    const project = (
      await f.call('GET', `/api/projects/${created.json().id}`)
    ).json();
    expect(project.downloadStatus).toBe('download_failed');
    expect(project.downloadError).toBe('unexpected repository address');
  } finally {
    await f.close();
  }
});
