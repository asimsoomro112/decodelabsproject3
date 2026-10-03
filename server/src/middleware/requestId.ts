import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { setCurrentRequestId } from '../logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Assigns a request id, exposes it as the X-Request-Id response header
 * (required on every response, including errors), stashes it on the request,
 * and pushes it into the logger context. A client-supplied X-Request-Id is
 * honored when present so callers can correlate across retries.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim().slice(0, 128)
      : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  setCurrentRequestId(id);
  // The module-local id is shared; clear it when the response finishes so a
  // pooled/persistent connection cannot leak it into the next request's logs.
  res.on('finish', () => setCurrentRequestId(undefined));
  next();
}
