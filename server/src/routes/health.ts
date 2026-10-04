import { Router } from 'express';
import { query } from '../db.js';
import { serviceUnavailable } from '../errors.js';

export const healthRouter = Router();

// Liveness: the process is up. Skipped by the rate limiter.
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', uptime: Math.floor(process.uptime()) });
});

// Readiness: the process is up AND the database answers.
healthRouter.get('/ready', async (_req, res) => {
  try {
    await query('SELECT 1');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw serviceUnavailable(`Database is not reachable: ${msg}`);
  }
  res.json({ status: 'ready' });
});
