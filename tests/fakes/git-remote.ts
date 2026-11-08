import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * A real git remote on disk for tests: a bare repository plus a working copy
 * used to add commits to it. Cloning from it exercises the real git binary
 * without any network.
 */
export interface GitRemote {
  /** path of the bare repository; use it as a clone URL */
  url: string;
  branches: string[];
  /** adds a commit on a branch and pushes it */
  commit(branch: string, file: string, content: string): Promise<void>;
  /** replaces the history of a branch with an unrelated commit (a force push) */
  rewrite(branch: string): Promise<void>;
  /** adds a new branch from main */
  addBranch(name: string): Promise<void>;
  close(): Promise<void>;
}

const identity = async (git: SimpleGit) => {
  await git.addConfig('user.name', 'Fixture');
  await git.addConfig('user.email', 'fixture@example.invalid');
};

export async function createGitRemote(
  branches: string[] = ['main'],
): Promise<GitRemote> {
  const root = await mkdtemp(join(tmpdir(), 'staplr-remote-'));
  const work = join(root, 'work');
  const bare = join(root, 'remote.git');
  await mkdir(work);
  const git = simpleGit(work);
  await git.init(['--initial-branch=main']);
  await identity(git);
  await writeFile(join(work, 'README.md'), '# fixture\n');
  await git.add('.');
  await git.commit('initial');
  await simpleGit().clone(work, bare, ['--bare']);
  await git.addRemote('origin', bare);
  const known = new Set(['main']);
  for (const branch of branches)
    if (!known.has(branch)) {
      await git.checkoutLocalBranch(branch);
      await git.push('origin', branch);
      await git.checkout('main');
      known.add(branch);
    }
  return {
    url: bare,
    branches: [...known],
    async commit(branch, file, content) {
      await git.checkout(branch);
      await writeFile(join(work, file), content);
      await git.add('.');
      await git.commit(`update ${file}`);
      await git.push('origin', branch);
    },
    async rewrite(branch) {
      await git.checkout(['--orphan', `rewrite-${Date.now()}`]);
      await writeFile(join(work, 'REWRITTEN'), 'history was replaced\n');
      await git.add('.');
      await git.commit('rewritten history');
      await git.push('origin', `HEAD:refs/heads/${branch}`, ['--force']);
    },
    async addBranch(name) {
      await git.checkout('main');
      await git.checkoutLocalBranch(name);
      await git.push('origin', name);
      await git.checkout('main');
      known.add(name);
    },
    close: () => rm(root, { recursive: true, force: true }),
  };
}
