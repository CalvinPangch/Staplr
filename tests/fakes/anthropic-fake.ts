import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';

/**
 * A fake Anthropic Models API (GET /v1/models, paginated, key-specific).
 * The app reaches it only when STAPLR_TEST_MODE=1 sets
 * STAPLR_TEST_ANTHROPIC_API_URL. Keys are configured per test through setKey
 * or, from Playwright, through POST /__control/key.
 */
export interface AnthropicKeyProfile {
  /** model ids this key can see */
  models: string[];
  pageSize?: number;
  /** answer 401 authentication_error */
  reject?: boolean;
  /** answer every request with this status, for example 429 or 503 */
  failWith?: number;
}

export interface PricingProfile {
  /** answer with this status instead of the page */
  status?: number;
  /** serve this text instead of the saved copy */
  body?: string;
}

export interface AnthropicFake {
  url: string;
  /** where the fake serves each official pricing page (saved copies in tests/fixtures) */
  pricingUrls: { claude: string; codex: string };
  /** change what a pricing page answers; null restores the saved copy */
  setPricing(
    provider: 'claude' | 'codex',
    profile: PricingProfile | null,
  ): void;
  /** pricing page requests served, by provider */
  pricingHits: string[];
  setKey(key: string, profile: AnthropicKeyProfile): void;
  /** GET /v1/models requests served, as "after_id" cursors ("" for the first page) */
  pages: string[];
  /** whether a request ever carried each key (never stores the key itself) */
  reset(): void;
  close(): Promise<void>;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const pricingFiles = {
  claude: 'tests/fixtures/pricing-claude.md',
  codex: 'tests/fixtures/pricing-openai.md',
} as const;

export async function startAnthropicFake(port = 0): Promise<AnthropicFake> {
  const keys = new Map<string, AnthropicKeyProfile>();
  const pages: string[] = [];
  const pricing = new Map<'claude' | 'codex', PricingProfile>();
  const pricingHits: string[] = [];

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://fake.local');
    const method = request.method ?? 'GET';
    if (url.pathname === '/__control/key' && method === 'POST') {
      const { key, profile } = JSON.parse(await readBody(request)) as {
        key: string;
        profile: AnthropicKeyProfile;
      };
      keys.set(key, profile);
      return json(response, 200, { ok: true });
    }
    if (url.pathname === '/__control/reset' && method === 'POST') {
      keys.clear();
      pages.length = 0;
      pricing.clear();
      return json(response, 204, {});
    }
    if (url.pathname === '/__control/pricing' && method === 'POST') {
      const { provider, profile } = JSON.parse(await readBody(request)) as {
        provider: 'claude' | 'codex';
        profile: PricingProfile | null;
      };
      if (profile) pricing.set(provider, profile);
      else pricing.delete(provider);
      return json(response, 200, { ok: true });
    }
    const pricingPage = /^\/pricing\/(claude|codex)\.md$/.exec(url.pathname);
    if (pricingPage && method === 'GET') {
      const provider = pricingPage[1] as 'claude' | 'codex';
      pricingHits.push(provider);
      const profile = pricing.get(provider);
      if (profile?.status) return json(response, profile.status, {});
      response.writeHead(200, { 'content-type': 'text/markdown' });
      response.end(profile?.body ?? readFileSync(pricingFiles[provider]));
      return;
    }
    if (url.pathname !== '/v1/models' || method !== 'GET')
      return json(response, 404, {
        type: 'error',
        error: { type: 'not_found_error', message: 'Not found' },
      });
    const header = request.headers['x-api-key'];
    const profile = typeof header === 'string' ? keys.get(header) : undefined;
    if (profile?.failWith)
      return json(response, profile.failWith, {
        type: 'error',
        error: { type: 'api_error', message: 'try again' },
      });
    if (!profile || profile.reject)
      return json(response, 401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      });
    const after = url.searchParams.get('after_id') ?? '';
    pages.push(after);
    const limit = Math.min(
      Number(url.searchParams.get('limit') ?? 20),
      profile.pageSize ?? 20,
    );
    const start = after ? profile.models.indexOf(after) + 1 : 0;
    const slice = profile.models.slice(start, start + limit);
    return json(response, 200, {
      data: slice.map((id) => ({
        type: 'model',
        id,
        display_name: id,
        created_at: '2026-01-01T00:00:00Z',
      })),
      has_more: start + limit < profile.models.length,
      first_id: slice[0] ?? null,
      last_id: slice[slice.length - 1] ?? null,
    });
  }

  const server: Server = createServer((request, response) => {
    handle(request, response).catch(() =>
      json(response, 500, {
        type: 'error',
        error: { type: 'api_error', message: 'fake failed' },
      }),
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  );
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    pricingUrls: {
      claude: `${url}/pricing/claude.md`,
      codex: `${url}/pricing/codex.md`,
    },
    setPricing: (provider, profile) => {
      if (profile) pricing.set(provider, profile);
      else pricing.delete(provider);
    },
    pricingHits,
    setKey: (key, profile) => void keys.set(key, profile),
    pages,
    reset() {
      keys.clear();
      pages.length = 0;
      pricing.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
