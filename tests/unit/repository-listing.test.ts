import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createGithubAdapter } from '../../src/server/modules/source-control/adapters/github';
import { createGitlabAdapter } from '../../src/server/modules/source-control/adapters/gitlab';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const gh = 'https://api.github.com';
const github = createGithubAdapter(gh);
const glBase = 'https://gitlab.example.test';
const gitlab = createGitlabAdapter(glBase);

const ghRepo = (id: number, name: string, push = true) => ({
  id,
  full_name: name,
  default_branch: 'main',
  private: id % 2 === 0,
  clone_url: `https://github.com/${name}.git`,
  permissions: { push, pull: true },
});

describe('GitHub repositories', () => {
  it('follows pages and keeps only repositories the token can push to', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${gh}/user/repos`, ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? 1);
        seen.push(`page=${page} per_page=${url.searchParams.get('per_page')}`);
        if (page === 1)
          return HttpResponse.json(
            [ghRepo(1, 'org/alpha'), ghRepo(2, 'org/read-only', false)],
            {
              headers: {
                link: `<${gh}/user/repos?per_page=100&page=2>; rel="next"`,
              },
            },
          );
        return HttpResponse.json([ghRepo(3, 'org/gamma')]);
      }),
    );
    const result = await github.listRepositories('ghp_x');
    expect(result).toEqual({
      ok: true,
      repositories: [
        {
          remoteId: '1',
          fullName: 'org/alpha',
          defaultBranch: 'main',
          private: false,
        },
        {
          remoteId: '3',
          fullName: 'org/gamma',
          defaultBranch: 'main',
          private: false,
        },
      ],
    });
    expect(seen).toEqual(['page=1 per_page=100', 'page=2 per_page=100']);
  });

  it('searches by name, ignoring case', async () => {
    server.use(
      http.get(`${gh}/user/repos`, () =>
        HttpResponse.json([
          ghRepo(1, 'org/Alpha-service'),
          ghRepo(2, 'org/beta'),
          ghRepo(3, 'tools/alphabet'),
        ]),
      ),
    );
    const result = await github.listRepositories('ghp_x', 'ALPHA');
    expect(result.ok && result.repositories.map((r) => r.fullName)).toEqual([
      'org/Alpha-service',
      'tools/alphabet',
    ]);
  });

  it('stops after ten pages', async () => {
    let calls = 0;
    server.use(
      http.get(`${gh}/user/repos`, ({ request }) => {
        calls++;
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json([ghRepo(page, `org/r${page}`)], {
          headers: {
            link: `<${gh}/user/repos?per_page=100&page=${page + 1}>; rel="next"`,
          },
        });
      }),
    );
    const result = await github.listRepositories('ghp_x');
    expect(calls).toBe(10);
    expect(result.ok && result.repositories).toHaveLength(10);
  });

  it('reads one repository with its clone address', async () => {
    server.use(
      http.get(`${gh}/repositories/7`, () =>
        HttpResponse.json(ghRepo(7, 'org/seven')),
      ),
    );
    expect(await github.getRepository('ghp_x', '7')).toEqual({
      ok: true,
      repository: {
        remoteId: '7',
        fullName: 'org/seven',
        defaultBranch: 'main',
        private: false,
        cloneUrl: 'https://github.com/org/seven.git',
      },
    });
  });

  it('lists branches of a repository', async () => {
    server.use(
      http.get(`${gh}/repositories/7`, () =>
        HttpResponse.json(ghRepo(7, 'org/seven')),
      ),
      http.get(`${gh}/repos/org/seven/branches`, () =>
        HttpResponse.json([{ name: 'main' }, { name: 'release' }]),
      ),
    );
    expect(await github.listBranches('ghp_x', '7')).toEqual({
      ok: true,
      branches: ['main', 'release'],
    });
  });

  it('maps failures: rejected token, missing repository, outage', async () => {
    server.use(
      http.get(`${gh}/user/repos`, () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
      http.get(`${gh}/repositories/404`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
      http.get(
        `${gh}/repositories/503`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    expect(await github.listRepositories('ghp_bad')).toEqual({
      ok: false,
      failure: 'invalid',
    });
    expect(await github.getRepository('ghp_x', '404')).toEqual({
      ok: false,
      failure: 'not_found',
    });
    expect(await github.getRepository('ghp_x', '503')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
    expect(await github.listBranches('ghp_x', '404')).toEqual({
      ok: false,
      failure: 'not_found',
    });
  });
});

describe('GitLab repositories', () => {
  const project = (id: number, path: string) => ({
    id,
    path_with_namespace: path,
    default_branch: 'trunk',
    visibility: id % 2 === 0 ? 'private' : 'public',
    http_url_to_repo: `${glBase}/${path}.git`,
  });

  it('lists member projects with developer access and searches on the server', async () => {
    let query = '';
    server.use(
      http.get(`${glBase}/api/v4/projects`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json([
          project(1, 'team/api'),
          project(2, 'team/web'),
        ]);
      }),
    );
    const result = await gitlab.listRepositories('glpat-x', 'api');
    expect(result).toEqual({
      ok: true,
      repositories: [
        {
          remoteId: '1',
          fullName: 'team/api',
          defaultBranch: 'trunk',
          private: false,
        },
        {
          remoteId: '2',
          fullName: 'team/web',
          defaultBranch: 'trunk',
          private: true,
        },
      ],
    });
    const params = new URLSearchParams(query);
    expect(params.get('membership')).toBe('true');
    expect(params.get('min_access_level')).toBe('30');
    expect(params.get('search')).toBe('api');
  });

  it('reads one project and its branches', async () => {
    server.use(
      http.get(`${glBase}/api/v4/projects/5`, () =>
        HttpResponse.json(project(5, 'team/five')),
      ),
      http.get(`${glBase}/api/v4/projects/5/repository/branches`, () =>
        HttpResponse.json([{ name: 'trunk' }, { name: 'dev' }]),
      ),
    );
    expect(await gitlab.getRepository('glpat-x', '5')).toEqual({
      ok: true,
      repository: {
        remoteId: '5',
        fullName: 'team/five',
        defaultBranch: 'trunk',
        private: false,
        cloneUrl: `${glBase}/team/five.git`,
      },
    });
    expect(await gitlab.listBranches('glpat-x', '5')).toEqual({
      ok: true,
      branches: ['trunk', 'dev'],
    });
  });

  it('maps failures', async () => {
    server.use(
      http.get(`${glBase}/api/v4/projects`, () =>
        HttpResponse.json({ message: '401 Unauthorized' }, { status: 401 }),
      ),
      http.get(`${glBase}/api/v4/projects/9`, () =>
        HttpResponse.json({ message: '404 Not found' }, { status: 404 }),
      ),
      http.get(
        `${glBase}/api/v4/projects/8`,
        () => new HttpResponse(null, { status: 502 }),
      ),
    );
    expect(await gitlab.listRepositories('glpat-bad')).toEqual({
      ok: false,
      failure: 'invalid',
    });
    expect(await gitlab.getRepository('glpat-x', '9')).toEqual({
      ok: false,
      failure: 'not_found',
    });
    expect(await gitlab.getRepository('glpat-x', '8')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
  });
});
