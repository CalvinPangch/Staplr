import { z } from 'zod';

export type ModelList =
  | { ok: true; modelIds: string[] }
  | { ok: false; failure: 'rejected' | 'unavailable' };

const page = z.object({
  data: z.array(z.object({ id: z.string() })),
  has_more: z.boolean(),
  last_id: z.string().nullable(),
});

const maxPages = 100;
const timeoutMs = 15_000;

/**
 * Reads the COMPLETE list of models this key can use from the Models API,
 * following every page. A key the API rejects (401/403) is "rejected"; any
 * network error, rate limit or outage is "unavailable", which says nothing
 * about the key. The key is only ever sent as the x-api-key header.
 */
export async function listAnthropicModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelList> {
  const modelIds: string[] = [];
  let after: string | undefined;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const url = new URL('/v1/models', baseUrl);
    url.searchParams.set('limit', '1000');
    if (after) url.searchParams.set('after_id', after);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, failure: 'unavailable' };
    }
    if (response.status === 401 || response.status === 403)
      return { ok: false, failure: 'rejected' };
    if (!response.ok) return { ok: false, failure: 'unavailable' };
    let parsed: z.infer<typeof page>;
    try {
      parsed = page.parse(await response.json());
    } catch {
      return { ok: false, failure: 'unavailable' };
    }
    modelIds.push(...parsed.data.map((m) => m.id));
    if (!parsed.has_more || !parsed.last_id) return { ok: true, modelIds };
    after = parsed.last_id;
  }
  // refuse a listing that never ends rather than trust a partial result
  return { ok: false, failure: 'unavailable' };
}
