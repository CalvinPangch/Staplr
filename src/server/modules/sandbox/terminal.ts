import { StringDecoder } from 'node:string_decoder';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Config } from '../../config.js';
import { ServiceError, sendProblem } from '../../lib/problem.js';
import {
  clientMessageSchema,
  type ServerMessage,
} from '../../../shared/schemas/sandbox.js';
import type { SandboxService } from './service.js';

/** 16 KiB of terminal input per second per session (contracts/sandbox-terminal.md). */
const inputBytesPerSecond = 16 * 1024;

const closeCodes = {
  normal: 1000,
  invalidMessage: 4400,
  unknownSession: 4404,
  idleTimeout: 4408,
  alreadyAttached: 4409,
  sandboxError: 4500,
} as const;

/**
 * The browser-to-sandbox terminal. Authentication and the Origin check happen
 * before the upgrade; terminal data is relayed and never logged or stored.
 */
export function terminalRoutes(
  app: FastifyInstance,
  service: SandboxService,
  config: Config,
) {
  const publicOrigin = new URL(config.publicUrl).origin;

  app.get(
    '/api/sandbox-sessions/:id/terminal',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (request.headers.origin !== publicOrigin)
          return sendProblem(
            reply,
            403,
            'invalid_origin',
            'Use this installation in its own browser tab and retry.',
          );
      },
    },
    (socket: WebSocket, request) => {
      const { id } = request.params as { id: string };
      const send = (message: ServerMessage) => {
        if (socket.readyState === socket.OPEN)
          socket.send(JSON.stringify(message));
      };

      // Messages can arrive while the sandbox attaches; queue them on `ready`.
      const ready = (async () => {
        try {
          const session = service.get(id);
          if (session.status !== 'in_progress') {
            socket.close(closeCodes.unknownSession);
            return null;
          }
          const handle = await service.attach(id);
          service.touch(id);
          return { handle, expiresAt: service.get(id).expiresAt };
        } catch (error) {
          if (error instanceof ServiceError)
            socket.close(
              error.status === 404
                ? closeCodes.unknownSession
                : error.status === 409
                  ? closeCodes.alreadyAttached
                  : closeCodes.sandboxError,
            );
          else socket.close(closeCodes.sandboxError);
          return null;
        }
      })();

      let unsubscribe: (() => void) | undefined;
      let attached = false;
      void ready.then((state) => {
        if (!state) return;
        attached = true;
        const decoder = new StringDecoder('utf8');
        state.handle.stream.on('data', (chunk: Buffer) => {
          const data = decoder.write(chunk);
          if (data) send({ type: 'output', data });
        });
        unsubscribe = service.subscribe(id, (event) => {
          if (event.type === 'expiresAt') {
            send({ type: 'expiresAt', at: event.at });
            return;
          }
          send({
            type: 'status',
            status: event.status,
            failureReason: event.failureReason,
            resultConnectionId: event.resultConnectionId,
          });
          socket.close(
            event.status === 'expired'
              ? closeCodes.idleTimeout
              : event.status === 'failed'
                ? closeCodes.sandboxError
                : closeCodes.normal,
          );
        });
        send({ type: 'expiresAt', at: state.expiresAt });
      });

      let allowance = inputBytesPerSecond;
      let refilled = performance.now();
      const allow = (bytes: number) => {
        const current = performance.now();
        allowance = Math.min(
          inputBytesPerSecond,
          allowance + ((current - refilled) / 1000) * inputBytesPerSecond,
        );
        refilled = current;
        if (bytes > allowance) return false;
        allowance -= bytes;
        return true;
      };

      socket.on('message', (raw: Buffer, isBinary: boolean) => {
        void (async () => {
          const state = await ready;
          if (!state) return;
          const reject = () => {
            send({
              type: 'error',
              code: 'invalid_message',
              message: 'That message was not understood.',
            });
            socket.close(closeCodes.invalidMessage);
          };
          if (isBinary) return reject();
          let message;
          try {
            message = clientMessageSchema.parse(
              JSON.parse(raw.toString('utf8')),
            );
          } catch {
            return reject();
          }
          if (message.type === 'input') {
            if (!allow(Buffer.byteLength(message.data))) {
              send({
                type: 'error',
                code: 'rate_limited',
                message: 'Typing too fast; the last input was dropped.',
              });
              return;
            }
            state.handle.stream.write(message.data);
            service.touch(id);
          } else if (message.type === 'resize') {
            await state.handle
              .resize(message.cols, message.rows)
              .catch(() => undefined);
          } else service.touch(id);
        })();
      });

      socket.on('close', () => {
        unsubscribe?.();
        if (attached) service.detach(id);
      });
    },
  );
}
