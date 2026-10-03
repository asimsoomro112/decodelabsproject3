import type { Request, Response } from 'express';
import { config } from '../config.js';
import { rateLimit } from 'express-rate-limit';

/**
 * Global API rate limiter. Health probes are skipped so orchestrators and
 * load balancers never get throttled. On excess, respond with RFC 9457
 * problem+json (NOT the default HTML/text handler) and a Retry-After hint.
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/api/v1/health' || req.path === '/api/v1/ready',
  handler: (_req: Request, res: Response) => {
    res.set('Retry-After', '60');
    res.status(429).type('application/problem+json').json({
      type: 'https://coursevault.dev/problems/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: `Rate limit exceeded: max ${config.rateLimitMax} requests per ${Math.round(config.rateLimitWindowMs / 1000)}s.`,
      instance: _req.originalUrl,
      requestId: (_req as Request).requestId ?? res.getHeader('X-Request-Id'),
      errors: [],
    });
  },
});
