import { z } from 'zod';
const schema = z.object({
  STAPLR_MASTER_KEY: z
    .string()
    .refine(
      (value) =>
        Buffer.from(value, 'base64').length === 32 &&
        Buffer.from(value, 'base64').toString('base64') === value,
      'STAPLR_MASTER_KEY must be canonical base64 for exactly 32 bytes',
    ),
  SESSION_SECRET: z.string().min(32),
  DATA_DIR: z.string().default('./data'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  STAPLR_ALLOW_INSECURE_HTTP: z.enum(['0', '1']).default('0'),
  DOCKER_HOST: z
    .string()
    .default(
      process.platform === 'win32'
        ? 'npipe:////./pipe/docker_engine'
        : 'unix:///var/run/docker.sock',
    ),
  STAPLR_TEST_MODE: z.enum(['0', '1']).default('0'),
  /** Points the GitHub adapter at a fake server. Only honoured in test mode. */
  STAPLR_TEST_GITHUB_API_URL: z.string().url().optional(),
  /** Points the Anthropic Models API client at a fake. Only honoured in test mode. */
  STAPLR_TEST_ANTHROPIC_API_URL: z.string().url().optional(),
  /** How the Codex CLI is driven in the sandbox. stub is for tests only. */
  STAPLR_CODEX_PROFILE: z.enum(['real', 'stub']).default('real'),
  STAPLR_CODEX_IMAGE: z.string().min(1).max(200).optional(),
  SANDBOX_IDLE_MS: z.coerce.number().int().positive().default(900000),
});
export function parseConfig(env: Record<string, string | undefined>) {
  const value = schema.parse(env);
  let url: URL;
  try {
    url = new URL(value.PUBLIC_URL);
  } catch {
    throw new Error('PUBLIC_URL must use HTTPS or local HTTP');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      (local || value.STAPLR_ALLOW_INSECURE_HTTP === '1')
    )
  )
    throw new Error('HTTPS is required for non-local PUBLIC_URL');
  if (url.username || url.password)
    throw new Error('PUBLIC_URL must not contain credentials');
  if (value.STAPLR_TEST_GITHUB_API_URL && value.STAPLR_TEST_MODE !== '1')
    throw new Error(
      'STAPLR_TEST_GITHUB_API_URL is only allowed when STAPLR_TEST_MODE=1',
    );
  if (value.STAPLR_TEST_ANTHROPIC_API_URL && value.STAPLR_TEST_MODE !== '1')
    throw new Error(
      'STAPLR_TEST_ANTHROPIC_API_URL is only allowed when STAPLR_TEST_MODE=1',
    );
  if (value.STAPLR_CODEX_PROFILE === 'stub' && value.STAPLR_TEST_MODE !== '1')
    throw new Error(
      'STAPLR_CODEX_PROFILE=stub is only allowed when STAPLR_TEST_MODE=1',
    );
  return {
    masterKey: Buffer.from(value.STAPLR_MASTER_KEY, 'base64'),
    sessionSecret: value.SESSION_SECRET,
    dataDir: value.DATA_DIR,
    port: value.PORT,
    host: value.HOST,
    publicUrl: value.PUBLIC_URL,
    cookieSecure: url.protocol === 'https:',
    allowInsecureHttp: value.STAPLR_ALLOW_INSECURE_HTTP === '1',
    dockerHost: value.DOCKER_HOST,
    testMode: value.STAPLR_TEST_MODE === '1',
    githubApiUrl: value.STAPLR_TEST_GITHUB_API_URL ?? 'https://api.github.com',
    anthropicApiUrl:
      value.STAPLR_TEST_ANTHROPIC_API_URL ?? 'https://api.anthropic.com',
    codexProfile: value.STAPLR_CODEX_PROFILE,
    codexImage:
      value.STAPLR_CODEX_IMAGE ??
      (value.STAPLR_CODEX_PROFILE === 'stub'
        ? 'staplr-sandbox-stub:test'
        : 'staplr-codex:local'),
    sandboxIdleMs: value.SANDBOX_IDLE_MS,
  };
}
export type Config = ReturnType<typeof parseConfig>;
