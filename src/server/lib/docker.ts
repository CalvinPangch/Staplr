import Docker from 'dockerode';
import { Duplex, PassThrough } from 'node:stream';
export function createDockerClient(host = process.env['DOCKER_HOST']) {
  if (!host) return new Docker();
  if (host.startsWith('unix://'))
    return new Docker({ socketPath: host.slice(7) });
  if (host.startsWith('npipe://'))
    return new Docker({ socketPath: host.slice(8) });
  const url = new URL(host.replace(/^tcp:/, 'http:'));
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported Docker transport');
  return new Docker({
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 2376 : 2375)),
    protocol: url.protocol === 'https:' ? 'https' : 'http',
  });
}
export function createHardenedContainer(
  docker: Docker,
  opts: { image: string; command: string[]; label: string; env?: string[] },
) {
  return docker.createContainer({
    Image: opts.image,
    Cmd: opts.command,
    User: '1000:1000',
    WorkingDir: '/home/agent',
    Env: ['HOME=/home/agent', ...(opts.env ?? [])],
    Labels: { 'staplr.managed': 'true', [opts.label]: 'true' },
    HostConfig: {
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      ReadonlyRootfs: true,
      Tmpfs: {
        '/home/agent': 'rw,nosuid,size=64m,uid=1000,gid=1000,mode=0700',
        '/tmp': 'rw,nosuid,size=64m,mode=1777',
      },
      Memory: 512 * 1024 * 1024,
      NanoCpus: 1000000000,
      PidsLimit: 256,
      Privileged: false,
      AutoRemove: false,
      NetworkMode: 'bridge',
    },
  });
}
export async function execStream(
  container: Docker.Container,
  command: string[],
  tty = false,
  stdin = false,
): Promise<Duplex> {
  const exec = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: stdin,
    Tty: tty,
    User: '1000:1000',
  });
  const socket = await exec.start({
    hijack: true,
    stdin,
    Tty: tty,
    Detach: false,
  });
  if (tty) return socket;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stderr.resume();
  const modem = container.modem as {
    demuxStream(
      source: NodeJS.ReadableStream,
      out: NodeJS.WritableStream,
      err: NodeJS.WritableStream,
    ): void;
  };
  modem.demuxStream(socket, stdout, stderr);
  socket.on('end', () => stdout.end());
  socket.on('error', (error) => stdout.destroy(error));
  const stream = new Duplex({
    read() {
      stdout.resume();
    },
    write(chunk, encoding, done) {
      socket.write(chunk, encoding, done);
    },
    final(done) {
      socket.end(done);
    },
    destroy(error, done) {
      socket.destroy();
      stdout.destroy();
      stderr.destroy();
      done(error);
    },
  });
  stdout.on('data', (chunk: Buffer) => {
    if (!stream.push(chunk)) stdout.pause();
  });
  stdout.on('end', () => stream.push(null));
  stdout.on('error', (error) => stream.destroy(error));
  return stream;
}
export async function removeQuietly(container: Docker.Container) {
  try {
    await container.remove({ force: true });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('statusCode' in error) ||
      error.statusCode !== 404
    )
      throw error;
  }
}
export async function cleanupOrphans(docker: Docker, label: string) {
  const containers = await docker.listContainers({
    all: true,
    filters: JSON.stringify({
      label: ['staplr.managed=true', `${label}=true`],
    }),
  });
  for (const container of containers)
    await removeQuietly(docker.getContainer(container.Id));
}
