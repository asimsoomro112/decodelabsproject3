import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReference } from '@scalar/express-api-reference';
import { config } from './config.js';
import { httpLogger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { sqlInspector } from './middleware/sqlInspector.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { runWithQueryLog } from './inspector.js';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';
import { coursesRouter } from './routes/courses.js';
import { statsRouter } from './routes/stats.js';
import { schemaRouter } from './routes/schema.js';
import { labRouter } from './routes/lab.js';
import { openapiDoc } from './openapi.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  // --- security & plumbing -------------------------------------------------
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin / curl / server-to-server: no Origin header -> allow.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, origin);
        return callback(null, false);
      },
    }),
  );
  app.use(httpLogger);
  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));

  // Per-request SQL query log for the inspector, then the inspector itself.
  // Both run BEFORE the routes (the inspector wraps res.json after handlers).
  app.use((_req, _res, next) => runWithQueryLog(() => next()));
  app.use(sqlInspector);

  // Rate limit the API, but never the health probes.
  app.use(apiLimiter);

  // --- API -----------------------------------------------------------------
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/courses', coursesRouter);
  app.use('/api/v1', statsRouter);
  app.use('/api/v1', schemaRouter);
  app.use('/api/v1/lab/injection-demo', labRouter);

  // --- docs ----------------------------------------------------------------
  app.get('/openapi.json', (_req, res) => {
    res.json(openapiDoc);
  });
  app.use(
    '/reference',
    apiReference({
      theme: 'kepler',
      sources: [{ title: 'CourseVault API', url: '/openapi.json' }],
    }),
  );

  // --- production: serve the built client as ONE service --------------------
  // Registered AFTER the API routes and explicitly skipping /api/*,
  // /openapi.json and /reference so the SPA fallback can never shadow them.
  if (config.nodeEnv === 'production') {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // dist/src/app.js -> <repo>/client/dist
    const clientDist = path.resolve(here, '..', '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path === '/openapi.json' ||
        req.path.startsWith('/reference')
      ) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // --- errors ----------------------------------------------------------------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
