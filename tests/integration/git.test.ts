import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { clone, fetchAndFastForward } from '../../src/server/lib/git';
it('keeps credentials out of the clone URL/config, fast-forwards and refuses rewritten history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'staplr-git-'));
  try {
    const source = join(dir, 'source');
    const bare = join(dir, 'remote.git');
    const target = join(dir, 'base');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(source);
    const git = simpleGit(source);
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Fixture');
    await git.addConfig('user.email', 'fixture@example.invalid');
    await writeFile(join(source, 'README'), 'first');
    await git.add('.');
    await git.commit('first');
    await simpleGit().clone(source, bare, ['--bare']);
    await git.addRemote('origin', bare);
    await clone(bare, target, 'known-private-token');
    expect(await readFile(join(target, '.git/config'), 'utf8')).not.toContain(
      'known-private-token',
    );
    await writeFile(join(source, 'README'), 'second');
    await git.add('.');
    await git.commit('second');
    await git.push('origin', 'main');
    await fetchAndFastForward(target, 'main', 'known-private-token');
    const prior = await simpleGit(target).revparse(['HEAD']);
    expect(await readFile(join(target, 'README'), 'utf8')).toBe('second');
    await git.checkout(['--orphan', 'replacement']);
    await git.add('.');
    await git.commit('rewritten');
    await git.push('origin', 'HEAD:main', ['--force']);
    await expect(
      fetchAndFastForward(target, 'main', 'known-private-token'),
    ).rejects.toThrow('history_rewritten');
    expect(await simpleGit(target).revparse(['HEAD'])).toBe(prior);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
