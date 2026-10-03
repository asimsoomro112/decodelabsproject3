import { Router } from 'express';
import { getStats } from '../repos/statsRepo.js';

export const statsRouter = Router();

// GET /api/v1/stats — JOIN + GROUP BY aggregates for the Vault dashboard.
statsRouter.get('/stats', async (_req, res) => {
  const stats = await getStats();
  res.json({ data: stats });
});
