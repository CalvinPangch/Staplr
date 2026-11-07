import { it, expect } from 'vitest';
import {
  createDockerClient,
  createHardenedContainer,
  execStream,
} from '../../src/server/lib/docker';
const host = 'http://127.0.0.1:23750';
it('allows only the required sandbox lifecycle endpoints and rejects unrelated APIs', async () => {
  const docker = createDockerClient(host);
  const image = await docker.getImage('alpine:3.22').inspect();
  expect(image.Id).toBeTruthy();
  const c = await createHardenedContainer(docker, {
    image: 'alpine:3.22',
    command: ['sleep', '30'],
    label: 'staplr.test',
  });
  try {
    await c.start();
    const stream = await execStream(
      c,
      ['sh', '-c', 'echo sandbox-ready'],
      true,
    );
    let output = '';
    for await (const chunk of stream) output += String(chunk);
    expect(output).toContain('sandbox-ready');
    await c.logs({ stdout: true, stderr: true });
    await c.stop();
    await c.start();
    await c.kill();
  } finally {
    await c.remove({ force: true });
  }
  for (const [method, path] of [
    ['POST', '/volumes/create'],
    ['POST', '/build'],
    ['GET', '/swarm'],
  ] as const) {
    const reply = await fetch(host + path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    expect(reply.status, path).toBe(403);
  }
});
