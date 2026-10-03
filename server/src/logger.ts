import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';

// Module-local request id, set per request by middleware/requestId.ts.
// (Racy under extreme concurrency, but pino-http attaches its own req.id
// too; this mixin keeps the human-readable X-Request-Id in every log line.)
let currentRequestId: string | undefined;

export function setCurrentRequestId(id: string | undefined): void {
  currentRequestId = id;
}

export const logger = pino({
  level: config.logLevel,
  // Nothing sensitive is logged by this API; redact the usual suspects anyway.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[redacted]',
  },
  mixin() {
    return currentRequestId ? { requestId: currentRequestId } : {};
  },
});

export const httpLogger = pinoHttp({ logger });
