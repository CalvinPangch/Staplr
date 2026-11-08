import pino, { type DestinationStream } from 'pino';
const secretKey =
  /^(token|password|credential.*|cookie|authorization|secret|api[-_]?key|x-api-key)$/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}
export function createLogger(
  destination?: DestinationStream,
  requestId?: string,
) {
  const options: pino.LoggerOptions = {
    base: requestId ? { requestId } : undefined,
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map(redact) as Parameters<typeof method>);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
