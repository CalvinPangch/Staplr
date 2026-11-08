import { it, expect } from 'vitest';
import {
  createDockerClient,
  createHardenedContainer,
} from '../../src/server/lib/docker';
it('enforces sandbox isolation and resource limits in the actual daemon', async () => {
  const docker = createDockerClient();
  const container = await createHardenedContainer(docker, {
    image: 'alpine:3.22',
    command: ['sleep', '30'],
    label: 'staplr.test',
  });
  try {
    await container.start();
    const info = await container.inspect();
    expect(info.Config.User).toBe('1000:1000');
    expect(info.HostConfig.CapDrop).toEqual(['ALL']);
    expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
    expect(info.HostConfig.ReadonlyRootfs).toBe(true);
    expect(info.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(info.HostConfig.NanoCpus).toBe(1000000000);
    expect(info.HostConfig.PidsLimit).toBe(256);
    expect(info.HostConfig.Binds ?? []).toEqual([]);
    expect(info.HostConfig.Tmpfs?.['/home/agent']).toContain('size=64m');
    expect(info.HostConfig.Tmpfs?.['/tmp']).toContain('nosuid');
    expect(info.Config.Labels['staplr.managed']).toBe('true');
  } finally {
    await container.remove({ force: true });
  }
});
