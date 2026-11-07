import { simpleGit, type SimpleGit } from 'simple-git';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
async function authenticated<T>(
  token: string,
  cwd: string | undefined,
  run: (git: SimpleGit) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'staplr-askpass-'));
  const helper = join(directory, 'askpass.sh');
  try {
    await writeFile(
      helper,
      '#!/bin/sh\ncase "$1" in *sername*) printf "%s" "oauth2" ;; *) printf "%s" "$STAPLR_GIT_TOKEN" ;; esac\n',
      { mode: 0o700 },
    );
    const permitted =
      /^(path|systemroot|systemdrive|windir|comspec|home|userprofile|temp|tmp|appdata|localappdata|lang|https_proxy|http_proxy|no_proxy|ssl_cert_file|ssl_cert_dir)$/i;
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name, value]) => permitted.test(name) && value !== undefined,
      ),
    );
    const git = simpleGit({
      ...(cwd ? { baseDir: cwd } : {}),
      allowEnvironment: ['GIT_ASKPASS', 'GIT_TERMINAL_PROMPT'],
      unsafe: { allowUnsafeAskPass: true },
    }).env({
      ...environment,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: helper.replaceAll('\\', '/'),
      STAPLR_GIT_TOKEN: token,
    });
    return await run(git);
  } catch (error) {
    if (error instanceof Error && error.message === 'history_rewritten')
      throw error;
    throw new Error('repository_operation_failed', { cause: error });
  } finally {
    await unlink(helper).catch(() => {});
    await rmdir(directory);
  }
}
export async function clone(remote: string, target: string, token: string) {
  await authenticated(token, undefined, async (git) => {
    await git.clone(remote, target);
  });
}
export async function fetchAndFastForward(
  path: string,
  branch: string,
  token: string,
) {
  await authenticated(token, path, async (git) => {
    await git.fetch(['--prune', 'origin']);
    const remote = `refs/remotes/origin/${branch}`;
    const base = await git.raw(['merge-base', 'HEAD', remote]);
    const head = await git.revparse(['HEAD']);
    if (base.trim() !== head.trim()) throw new Error('history_rewritten');
    await git.checkout(branch);
    await git.raw(['merge', '--ff-only', `refs/remotes/origin/${branch}`]);
  });
}
export async function listRemoteBranches(remote: string, token: string) {
  return authenticated(token, undefined, async (git) => {
    const output = await git.listRemote(['--heads', remote]);
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('refs/heads/')[1])
      .filter((name): name is string => Boolean(name));
  });
}
