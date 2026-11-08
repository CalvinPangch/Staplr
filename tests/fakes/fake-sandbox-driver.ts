import { Duplex, PassThrough } from 'node:stream';
import {
  buildTar,
  extractAuthFile,
} from '../../src/server/modules/providers/credential-bundle';
import type {
  ExecResult,
  SandboxDriver,
} from '../../src/server/modules/sandbox/driver';

/**
 * An in-memory SandboxDriver that behaves like docker/sandbox/stub.Dockerfile:
 * typing "OK [expired=true] [denied=a,b] [transient=1] [expires_at=ISO] [models=a,b]" in the
 * terminal "signs in" and writes a credential file; stub-status and stub-probe
 * read it. The real shell stub is exercised by the Docker tests.
 */
interface FakeContainer {
  id: string;
  authJson: string | null;
  /** signed in through this container's own terminal (flags only apply to restores) */
  signedInHere: boolean;
  removed: boolean;
}

export interface FakeSandboxDriver extends SandboxDriver {
  containers: Map<string, FakeContainer>;
  /** containers created and not yet removed */
  live(): string[];
  /** every exec command issued, for assertions (never contains secrets) */
  commands: string[][];
  /** simulate the provider revoking every login */
  revokeAll(): void;
  failCreate: boolean;
  /** while set, every model probe waits for it (to observe discovery in progress) */
  probeGate: Promise<void> | null;
  /** simulate a temporary Codex outage: status, list and probes exit 75 */
  outage: boolean;
  /** when set, every login lists exactly these models (the account changed) */
  listedModels: string[] | null;
}

const ok = (stdout: Buffer = Buffer.alloc(0)): ExecResult => ({
  exitCode: 0,
  stdout,
  stderr: Buffer.alloc(0),
  timedOut: false,
});
const exit = (exitCode: number): ExecResult => ({
  exitCode,
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  timedOut: false,
});

/** The models the stub lists when the login did not name any (the shipped Codex catalog). */
const defaultModels = [
  'gpt-6-astra',
  'gpt-6.1-sol',
  'gpt-6.1-terra',
  'gpt-6-luna',
];

export function createFakeSandboxDriver(): FakeSandboxDriver {
  const containers = new Map<string, FakeContainer>();
  const commands: string[][] = [];
  let counter = 0;
  let revoked = false;
  const get = (id: string) => {
    const container = containers.get(id);
    if (!container || container.removed) throw new Error('No such container');
    return container;
  };
  const parse = (json: string) =>
    JSON.parse(json) as {
      expired?: boolean;
      denied?: string[];
      transient?: boolean;
      models?: string[];
    };

  const driver: FakeSandboxDriver = {
    containers,
    commands,
    failCreate: false,
    probeGate: null,
    outage: false,
    listedModels: null,
    live: () =>
      [...containers.values()].filter((c) => !c.removed).map((c) => c.id),
    revokeAll() {
      revoked = true;
    },
    async create() {
      if (driver.failCreate) throw new Error('docker unavailable');
      const id = `fake-${++counter}`;
      containers.set(id, {
        id,
        authJson: null,
        signedInHere: false,
        removed: false,
      });
      return id;
    },
    async terminal(id) {
      const container = get(id);
      const input = new PassThrough();
      const output = new PassThrough();
      output.write(
        'Open https://auth.stub.invalid/device and enter code STUB-1234\r\n',
      );
      let buffer = '';
      input.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line === 'OK' || line.startsWith('OK ')) {
            const options = Object.fromEntries(
              line
                .split(/\s+/)
                .slice(1)
                .map((pair) => pair.split('=') as [string, string]),
            );
            container.authJson = JSON.stringify({
              tokens: { access_token: `fake-secret-${id}` },
              expired: options['expired'] === 'true',
              denied: (options['denied'] ?? '').split(',').filter(Boolean),
              transient: options['transient'] === '1',
              expires_at: options['expires_at'] ?? null,
              models: (options['models'] ?? '').split(',').filter(Boolean),
            });
            container.signedInHere = true;
            output.write('Login complete.\r\n');
          }
          newline = buffer.indexOf('\n');
        }
      });
      return {
        stream: Duplex.from({
          writable: input,
          readable: output,
        } as unknown as Parameters<typeof Duplex.from>[0]),
        async resize() {},
      };
    },
    async exec(id, command, options = {}) {
      commands.push(command);
      const container = get(id);
      const [program, ...args] = command;
      if (program === 'tar' && args.includes('-c'))
        return container.authJson
          ? ok(
              buildTar([
                {
                  name: '.codex/auth.json',
                  content: Buffer.from(
                    container.authJson,
                    'utf8',
                  ) as Buffer<ArrayBuffer>,
                },
              ]),
            )
          : exit(1);
      if (program === 'tar' && args.includes('-x')) {
        const content = extractAuthFile(options.stdin ?? Buffer.alloc(0));
        if (!content) return exit(1);
        container.authJson = content.toString('utf8');
        return ok();
      }
      if (
        driver.outage &&
        ['stub-models', 'stub-status', 'stub-probe'].includes(program ?? '')
      )
        return exit(75);
      if (program === 'stub-models') {
        const state = container.authJson ? parse(container.authJson) : {};
        if (state.transient) return exit(75);
        // models=- means the login can use no model at all
        const listed = driver.listedModels
          ? driver.listedModels
          : state.models?.[0] === '-'
            ? []
            : state.models?.length
              ? state.models
              : defaultModels;
        return ok(
          Buffer.from(
            JSON.stringify({
              models: [
                ...listed.map((slug) => ({
                  slug,
                  display_name: `Stub ${slug}`,
                  visibility: 'list',
                  supported_in_api: true,
                })),
                {
                  slug: 'stub-hidden',
                  display_name: 'Hidden',
                  visibility: 'hide',
                  supported_in_api: true,
                },
              ],
            }),
          ),
        );
      }
      if (program === 'stub-probe' && driver.probeGate) await driver.probeGate;
      if (program === 'stub-status' || program === 'stub-probe') {
        if (!container.authJson) return exit(1);
        if (container.signedInHere) return ok();
        const state = parse(container.authJson);
        if (state.transient) return exit(75);
        if (revoked || state.expired) return exit(2);
        if (program === 'stub-probe' && state.denied?.includes(args[0] ?? ''))
          return exit(3);
        return ok();
      }
      return exit(127);
    },
    async remove(id) {
      const container = containers.get(id);
      if (container) container.removed = true;
    },
  };
  return driver;
}

/** Signs in inside a fake container the way a person typing in the terminal would. */
export async function terminalFor(
  driver: SandboxDriver,
  containerId: string,
  line = 'OK',
): Promise<void> {
  const { stream } = await driver.terminal(containerId, ['stub-login']);
  stream.on('error', () => undefined);
  const complete = new Promise<void>((resolve) =>
    stream.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes('Login complete')) resolve();
    }),
  );
  stream.write(`${line}\n`);
  await complete;
  stream.destroy();
}
