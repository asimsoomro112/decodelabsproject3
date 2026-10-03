import type { Request, Response, NextFunction } from 'express';

/** 404 for unknown routes — RFC 9457 problem+json, same shape as all errors. */
export function notFound(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).type('application/problem+json').json({
    type: 'https://coursevault.dev/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: `No route matches ${req.method} ${req.originalUrl}.`,
    instance: req.originalUrl,
    requestId: req.requestId ?? res.getHeader('X-Request-Id'),
    errors: [],
  });
}
