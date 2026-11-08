/** A Problem response from the server (contracts/openapi.yaml). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const signedOutEvent = 'staplr:signed-out';

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const hasBody = init.body !== undefined;
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: hasBody ? { 'content-type': 'application/json' } : {},
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const body = (data ?? {}) as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    };
    // A 401 from a protected route means the session ended. Sign-in and
    // first-run setup answer 401/409 themselves and are not treated this way.
    if (
      response.status === 401 &&
      !path.startsWith('/api/session') &&
      path !== '/api/setup'
    )
      window.dispatchEvent(new Event(signedOutEvent));
    throw new ApiError(
      response.status,
      body.code ?? 'request_failed',
      body.message ?? 'The request failed. Check your connection and retry.',
      body.details,
    );
  }
  return data as T;
}

/** Turns any thrown value into text that is safe to show the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Check your connection and retry.';
}
