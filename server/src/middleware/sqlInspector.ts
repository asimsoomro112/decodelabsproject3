import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { getQueryLog } from '../inspector.js';

/**
 * Query Inspector middleware — MUST be registered before the routes.
 *
 * Wraps res.json: after a handler runs, when the inspector is enabled
 * (DEMO_SQL_INSPECTOR=true and not production) and the request carries
 * ?inspect=1, the per-request query log is merged into the JSON body as
 * meta.queries: [{ sql, params, durationMs }]. Only plain object bodies are
 * touched; arrays and non-JSON responses pass through unchanged.
 */
export function sqlInspector(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (
      config.sqlInspectorEnabled &&
      req.query.inspect === '1' &&
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      const record = body as Record<string, unknown>;
      const existingMeta = record.meta;
      const meta = {
        ...(typeof existingMeta === 'object' && existingMeta !== null ? existingMeta : {}),
        queries: getQueryLog(),
      };
      return originalJson({ ...record, meta });
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
}
