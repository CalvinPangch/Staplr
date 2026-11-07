import type { FastifyReply } from 'fastify';
import { problem, type ErrorCode } from '../../shared/schemas/common.js';

/** Sends a Problem response (contracts/openapi.yaml) with the right media type. */
export function sendProblem(
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return reply
    .code(status)
    .type('application/problem+json')
    .send(problem(code, message, details));
}

/** An expected failure a service raises; routes turn it into a Problem. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
