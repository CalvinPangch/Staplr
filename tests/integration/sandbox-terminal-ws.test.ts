import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { platformFixture } from './helpers';
import {
  createFakeSandboxDriver,
  type FakeSandboxDriver,
} from '../fakes/fake-sandbox-driver';

/** Terminal bridge per contracts/sandbox-terminal.md, using the in-memory driver. */
let driver: FakeSandboxDriver;
let f: Awaited<ReturnType<typeof platformFixture>>;
let port: number;
beforeEach(async () => {
  driver = createFakeSandboxDriver();
  f = await platformFixture({ driver });
  await f.app.listen({ port: 0, host: '127.0.0.1' });
  port = (f.app.server.address() as AddressInfo).port;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await f.close();
});

const startSession = async (name = 'ws') =>
  (
    await f.call('POST', '/api/sandbox-sessions', { provider: 'codex', name })
  ).json().id as string;

interface Client {
  socket: WebSocket;
  messages: Record<string, unknown>[];
  closed: Promise<{ code: number }>;
  next(type: string): Promise<Record<string, unknown>>;
  opened: Promise<void>;
}

function connect(
  id: string,
  headers: Record<string, string> = {},
  useCookie = true,
): Client {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/sandbox-sessions/${id}/terminal`,
    {
      headers: {
        origin: f.config.publicUrl,
        ...(useCookie ? { cookie: `staplr_session=${f.cookie}` } : {}),
        ...headers,
      },
    },
  );
  const messages: Record<string, unknown>[] = [];
  const waiting: {
    type: string;
    resolve: (m: Record<string, unknown>) => void;
  }[] = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw)) as Record<string, unknown>;
    messages.push(message);
    for (const w of [...waiting])
      if (w.type === message['type']) {
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve(message);
      }
  });
  return {
    socket,
    messages,
    opened: new Promise((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
      socket.once('unexpected-response', (req, res) => {
        // A rejected handshake never becomes a socket; release the connection
        // so the server can shut down.
        res.destroy();
        req.destroy();
        reject(new Error(`HTTP ${res.statusCode}`));
      });
    }),
    closed: new Promise((resolve) =>
      socket.once('close', (code) => resolve({ code })),
    ),
    next: (type) =>
      new Promise((resolve) => {
        const seen = messages.find((m) => m['type'] === type);
        if (seen) return resolve(seen);
        waiting.push({ type, resolve });
      }),
  };
}

describe('connecting', () => {
  it('rejects a handshake without a session or from another origin', async () => {
    const id = await startSession();
    const anonymous = connect(id, {}, false);
    await expect(anonymous.opened).rejects.toThrow('HTTP 401');
    const foreign = connect(id, { origin: 'https://evil.example' });
    await expect(foreign.opened).rejects.toThrow('HTTP 403');
  });

  it('closes with 4404 for an unknown or ended session', async () => {
    const missing = connect('does-not-exist');
    await missing.opened;
    expect((await missing.closed).code).toBe(4404);
    const id = await startSession();
    await f.call('DELETE', `/api/sandbox-sessions/${id}`);
    const ended = connect(id);
    await ended.opened;
    expect((await ended.closed).code).toBe(4404);
  });

  it('allows one terminal per session: a second socket gets 4409 and the first keeps working', async () => {
    const id = await startSession();
    const first = connect(id);
    await first.opened;
    await first.next('expiresAt');
    const second = connect(id);
    await second.opened;
    expect((await second.closed).code).toBe(4409);
    first.socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
    const output = await first.next('output');
    expect(String(output['data'])).toMatch(
      /auth\.stub\.invalid|Login complete/,
    );
    first.socket.close();
  });
});

describe('messages', () => {
  it('relays terminal output and input as the contract describes', async () => {
    const id = await startSession();
    const client = connect(id);
    await client.opened;
    let text = '';
    client.socket.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as { type: string; data?: string };
      if (m.type === 'output') text += m.data ?? '';
    });
    client.socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
    await vi.waitFor(() => expect(text).toContain('Login complete.'));
    client.socket.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
    client.socket.send(JSON.stringify({ type: 'ping' }));
    client.socket.close();
  });

  it('answers an invalid message with an error and closes with 4400', async () => {
    for (const bad of [
      'not json',
      JSON.stringify({ type: 'nope' }),
      JSON.stringify({ type: 'input', data: 'x'.repeat(4097) }),
      JSON.stringify({ type: 'resize', cols: 5, rows: 30 }),
      JSON.stringify({ type: 'resize', cols: 100, rows: 500 }),
      JSON.stringify({ type: 'input', data: 'a', extra: 1 }),
    ]) {
      const id = await startSession(`ws-${bad.length}-${Math.random()}`);
      const client = connect(id);
      await client.opened;
      client.socket.send(bad);
      const error = await client.next('error');
      expect(error['code']).toBe('invalid_message');
      expect((await client.closed).code).toBe(4400);
    }
  });

  it('rejects a frame over 64 KiB', async () => {
    const id = await startSession();
    const client = connect(id);
    await client.opened;
    client.socket.send(Buffer.alloc(64 * 1024 + 1, 97));
    expect((await client.closed).code).toBe(1009);
  });

  it('limits input to 16 KiB per second without ending the session', async () => {
    const id = await startSession();
    const client = connect(id);
    await client.opened;
    for (let i = 0; i < 6; i++)
      client.socket.send(
        JSON.stringify({ type: 'input', data: 'a'.repeat(4000) }),
      );
    const error = await client.next('error');
    expect(error['code']).toBe('rate_limited');
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
  });
});

describe('idle deadline and session end', () => {
  it('input and ping move the deadline forward', async () => {
    const id = await startSession();
    const client = connect(id);
    await client.opened;
    const first = await client.next('expiresAt');
    expect(first['at']).toBe('2026-11-08T00:15:00.000Z');
    f.advance(10 * 60_000);
    client.socket.send(JSON.stringify({ type: 'input', data: 'a' }));
    await vi.waitFor(() =>
      expect(
        client.messages
          .filter((m) => m['type'] === 'expiresAt')
          .map((m) => m['at']),
      ).toContain('2026-11-08T00:25:00.000Z'),
    );
    f.advance(5 * 60_000);
    client.socket.send(JSON.stringify({ type: 'ping' }));
    await vi.waitFor(() =>
      expect(
        client.messages
          .filter((m) => m['type'] === 'expiresAt')
          .map((m) => m['at']),
      ).toContain('2026-11-08T00:30:00.000Z'),
    );
    client.socket.close();
  });

  it('closes with the right code when the session ends', async () => {
    const cancelled = await startSession('a');
    const a = connect(cancelled);
    await a.opened;
    await a.next('expiresAt');
    await f.call('DELETE', `/api/sandbox-sessions/${cancelled}`);
    expect((await a.closed).code).toBe(1000);

    const idle = await startSession('b');
    const b = connect(idle);
    await b.opened;
    await b.next('expiresAt');
    f.advance(16 * 60_000);
    await f.app.sandbox.sweep();
    expect((await b.closed).code).toBe(4408);
    expect(b.messages.find((m) => m['type'] === 'status')).toMatchObject({
      status: 'expired',
    });

    const done = await startSession('c');
    const c = connect(done);
    await c.opened;
    c.socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
    await c.next('output');
    await vi.waitFor(async () => {
      const reply = await f.call(
        'POST',
        `/api/sandbox-sessions/${done}/complete`,
      );
      expect(reply.statusCode).toBe(200);
    });
    expect((await c.closed).code).toBe(1000);
  });
});

describe('terminal output stays private', () => {
  it('is never written to the process output or logs', async () => {
    const written: string[] = [];
    const record = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(record);
    vi.spyOn(process.stderr, 'write').mockImplementation(record);
    const id = await startSession();
    const client = connect(id);
    await client.opened;
    client.socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
    await client.next('output');
    await vi.waitFor(() =>
      expect(
        client.messages.some((m) =>
          String(m['data'] ?? '').includes('Login complete'),
        ),
      ).toBe(true),
    );
    client.socket.close();
    await client.closed;
    const everything = written.join('');
    expect(everything).not.toContain('Login complete');
    expect(everything).not.toContain('auth.stub.invalid');
    expect(everything).not.toContain('STUB-1234');
    expect(
      f.db.prepare('SELECT message,stack FROM error_event').all().length,
    ).toBe(0);
  });
});
