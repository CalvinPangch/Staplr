import type Docker from 'dockerode';
import type { Duplex } from 'node:stream';
import {
  createHardenedContainer,
  execCollect,
  removeQuietly,
  type ExecResult,
} from '../../lib/docker.js';

export type { ExecResult };

export interface TerminalHandle {
  stream: Duplex;
  resize(cols: number, rows: number): Promise<void>;
}

/**
 * Everything the sandbox features need from a container runtime. The Docker
 * implementation is below; tests use an in-memory one so most logic can be
 * verified without Docker.
 */
export interface SandboxDriver {
  /** Starts an idle, hardened container and returns its id. */
  create(): Promise<string>;
  /** Runs `command` with an interactive TTY (the provider's login). */
  terminal(containerId: string, command: string[]): Promise<TerminalHandle>;
  /** Runs a command to completion; output stays in memory. */
  exec(
    containerId: string,
    command: string[],
    options?: { stdin?: Buffer; timeoutMs?: number },
  ): Promise<ExecResult>;
  /** Removes the container; a missing container is not an error. */
  remove(containerId: string): Promise<void>;
}

/** Label every sandbox container carries so leftovers can be found and removed. */
export const sandboxLabel = 'staplr.sandbox';

export function createDockerDriver(
  docker: Docker,
  image: string,
): SandboxDriver {
  return {
    async create() {
      const container = await createHardenedContainer(docker, {
        image,
        command: ['sh', '-c', 'while true; do sleep 3600; done'],
        label: sandboxLabel,
      });
      await container.start();
      return container.id;
    },
    async terminal(containerId, command) {
      const exec = await docker.getContainer(containerId).exec({
        Cmd: command,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        User: '1000:1000',
      });
      const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
      return {
        stream,
        async resize(cols, rows) {
          await exec.resize({ w: cols, h: rows });
        },
      };
    },
    exec(containerId, command, options = {}) {
      return execCollect(docker.getContainer(containerId), command, options);
    },
    remove(containerId) {
      return removeQuietly(docker.getContainer(containerId));
    },
  };
}
