import { Router } from 'express';
import { getSchema } from '../repos/schemaRepo.js';

export const schemaRouter = Router();

// GET /api/v1/schema — read-only introspection (information_schema +
// pg_constraint) powering the interactive ER diagram. Tables carry columns,
// primary keys, foreign keys, uniques, checks and indexes; the client derives
// 1:1 / 1:M / M:M cardinality (junction = PK made of two FKs).
schemaRouter.get('/schema', async (_req, res) => {
  const schema = await getSchema();
  res.json({ data: schema });
});
