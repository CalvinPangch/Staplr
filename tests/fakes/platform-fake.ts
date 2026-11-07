import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake GitHub and GitLab for tests. The app reaches it only when
 * STAPLR_TEST_MODE=1 points STAPLR_TEST_GITHUB_API_URL (and a GitLab baseUrl)
 * here. Tokens are configured per test through setToken or, from Playwright,
 * through the /__control endpoints.
 */
export interface FakeRepo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private?: boolean;
  push?: boolean;
  branches?: string[];
  /** where git clones from; tests point it at a local bare repository */
  cloneUrl?: string;
}

export interface GithubProfile {
  login: string;
  /** classic tokens report scopes in X-OAuth-Scopes; fine-grained tokens do not */
  kind: 'classic' | 'fine';
  scopes?: string[];
  contentsRead?: boolean;
  contentsWrite?: boolean;
  prWrite?: boolean;
  revoked?: boolean;
  /** answer every request with this status, for example 503 */
  failWith?: number;
  repos?: FakeRepo[];
}

export interface GitlabProfile {
  username: string;
  scopes: string[];
  active?: boolean;
  revoked?: boolean;
  expiresAt?: string | null;
  unauthorized?: boolean;
  failWith?: number;
  repos?: FakeRepo[];
}

export interface PlatformFake {
  url: string;
  githubApiUrl: string;
  gitlabBaseUrl: string;
  github: { setToken(token: string, profile: GithubProfile): void };
  gitlab: { setToken(token: string, profile: GitlabProfile): void };
  /** every request path the fake served, in order */
  requests: string[];
  reset(): void;
  close(): Promise<void>;
}

function bearer(request: IncomingMessage): string {
  const privateToken = request.headers['private-token'];
  if (typeof privateToken === 'string') return privateToken;
  const header = request.headers['authorization'];
  return typeof header === 'string' ? (header.split(/\s+/).pop() ?? '') : '';
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export async function startPlatformFake(port = 0): Promise<PlatformFake> {
  const githubTokens = new Map<string, GithubProfile>();
  const gitlabTokens = new Map<string, GitlabProfile>();
  const requests: string[] = [];

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://fake.local');
    const method = request.method ?? 'GET';
    const path = url.pathname;
    requests.push(`${method} ${path}`);
    const body = method === 'GET' ? '' : await readBody(request);

    // ----- control API (used by Playwright and unit tests) -----
    if (path === '/__control/reset' && method === 'POST') {
      githubTokens.clear();
      gitlabTokens.clear();
      requests.length = 0;
      return json(response, 204, {});
    }
    if (path === '/__control/github/token' && method === 'POST') {
      const { token, profile } = JSON.parse(body) as {
        token: string;
        profile: GithubProfile;
      };
      githubTokens.set(token, profile);
      return json(response, 200, { ok: true });
    }
    if (path === '/__control/gitlab/token' && method === 'POST') {
      const { token, profile } = JSON.parse(body) as {
        token: string;
        profile: GitlabProfile;
      };
      gitlabTokens.set(token, profile);
      return json(response, 200, { ok: true });
    }

    // ----- GitHub -----
    if (path.startsWith('/github/')) {
      const profile = githubTokens.get(bearer(request));
      if (profile?.failWith) return json(response, profile.failWith, {});
      if (!profile || profile.revoked)
        return json(response, 401, { message: 'Bad credentials' });
      const rest = path.slice('/github'.length);
      if (rest === '/user' && method === 'GET')
        return json(
          response,
          200,
          { login: profile.login },
          profile.kind === 'classic'
            ? { 'x-oauth-scopes': (profile.scopes ?? []).join(', ') }
            : {},
        );
      if (rest === '/user/repos' && method === 'GET') {
        const all = profile.repos ?? [];
        const perPage = Number(url.searchParams.get('per_page') ?? 30);
        const page = Number(url.searchParams.get('page') ?? 1);
        const slice = all.slice((page - 1) * perPage, page * perPage);
        const links: Record<string, string> =
          page * perPage < all.length
            ? {
                link: `<${new URL(`/github/user/repos?per_page=${perPage}&page=${page + 1}`, `http://${request.headers.host}`).href}>; rel="next"`,
              }
            : {};
        return json(
          response,
          200,
          slice.map((r) => ({
            id: r.id,
            full_name: r.fullName,
            default_branch: r.defaultBranch,
            private: r.private ?? false,
            clone_url: r.cloneUrl ?? `https://github.invalid/${r.fullName}.git`,
            permissions: { push: r.push ?? true, pull: true },
          })),
          links,
        );
      }
      const byId = /^\/repositories\/(\d+)$/.exec(rest);
      if (byId && method === 'GET') {
        const repo = (profile.repos ?? []).find(
          (r) => r.id === Number(byId[1]),
        );
        if (!repo) return json(response, 404, { message: 'Not Found' });
        return json(response, 200, {
          id: repo.id,
          full_name: repo.fullName,
          default_branch: repo.defaultBranch,
          private: repo.private ?? false,
          clone_url:
            repo.cloneUrl ?? `https://github.invalid/${repo.fullName}.git`,
          permissions: { push: repo.push ?? true, pull: true },
        });
      }
      const repoPath = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(rest);
      if (repoPath) {
        const [, owner, name, tail = ''] = repoPath;
        const repo = (profile.repos ?? []).find(
          (r) => r.fullName === `${owner}/${name}`,
        );
        if (tail.startsWith('/contents')) {
          if (method === 'GET')
            return profile.contentsRead === false
              ? json(response, 403, {
                  message: 'Resource not accessible by personal access token',
                })
              : json(response, 200, []);
          if (method === 'PUT')
            return profile.contentsWrite === false
              ? json(response, 403, {
                  message: 'Resource not accessible by personal access token',
                })
              : json(response, 422, { message: 'Invalid request' });
        }
        if (tail === '/pulls' && method === 'POST')
          return profile.prWrite === false
            ? json(response, 403, {
                message: 'Resource not accessible by personal access token',
              })
            : json(response, 422, { message: 'Validation Failed' });
        if (tail === '/branches' && method === 'GET' && repo)
          return json(
            response,
            200,
            (repo.branches ?? [repo.defaultBranch]).map((b) => ({ name: b })),
          );
      }
      return json(response, 404, { message: 'Not Found' });
    }

    // ----- GitLab -----
    if (path.startsWith('/gitlab/api/v4/')) {
      const profile = gitlabTokens.get(bearer(request));
      if (profile?.failWith) return json(response, profile.failWith, {});
      if (!profile || profile.unauthorized)
        return json(response, 401, { message: '401 Unauthorized' });
      const rest = path.slice('/gitlab/api/v4'.length);
      if (rest === '/personal_access_tokens/self' && method === 'GET')
        return json(response, 200, {
          id: 1,
          scopes: profile.scopes,
          active: profile.active ?? true,
          revoked: profile.revoked ?? false,
          expires_at: profile.expiresAt ?? null,
        });
      if (rest === '/user' && method === 'GET')
        return json(response, 200, { username: profile.username });
      const gitlabProject = (r: FakeRepo) => ({
        id: r.id,
        path_with_namespace: r.fullName,
        default_branch: r.defaultBranch,
        visibility: r.private ? 'private' : 'public',
        http_url_to_repo:
          r.cloneUrl ?? `https://gitlab.invalid/${r.fullName}.git`,
      });
      if (rest === '/projects' && method === 'GET') {
        const search = (url.searchParams.get('search') ?? '').toLowerCase();
        const needsAccess = url.searchParams.get('min_access_level') !== null;
        return json(
          response,
          200,
          (profile.repos ?? [])
            .filter((r) => !needsAccess || r.push !== false)
            .filter((r) => r.fullName.toLowerCase().includes(search))
            .map(gitlabProject),
        );
      }
      const projectPath = /^\/projects\/(\d+)(\/repository\/branches)?$/.exec(
        rest,
      );
      if (projectPath && method === 'GET') {
        const repo = (profile.repos ?? []).find(
          (r) => r.id === Number(projectPath[1]),
        );
        if (!repo)
          return json(response, 404, { message: '404 Project Not Found' });
        return projectPath[2]
          ? json(
              response,
              200,
              (repo.branches ?? [repo.defaultBranch]).map((name) => ({ name })),
            )
          : json(response, 200, gitlabProject(repo));
      }
      return json(response, 404, { message: '404 Not Found' });
    }
    return json(response, 404, { message: 'Not Found' });
  }

  const server: Server = createServer((request, response) => {
    handle(request, response).catch(() =>
      json(response, 500, { message: 'fake failed' }),
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  );
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    githubApiUrl: `${url}/github`,
    gitlabBaseUrl: `${url}/gitlab`,
    github: {
      setToken: (token, profile) => void githubTokens.set(token, profile),
    },
    gitlab: {
      setToken: (token, profile) => void gitlabTokens.set(token, profile),
    },
    requests,
    reset() {
      githubTokens.clear();
      gitlabTokens.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
