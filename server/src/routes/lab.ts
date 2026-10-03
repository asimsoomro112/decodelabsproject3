import { Router } from 'express';
import { injectionInputSchema } from '../validation/schemas.js';
import { injectionDemo } from '../repos/labRepo.js';

export const labRouter = Router();

// POST /api/v1/lab/injection-demo { input }
// Returns the naive string-interpolated query (DISPLAY ONLY — never executed)
// next to the parameterized query that actually runs, its bound params, and
// the rows it returned. Try: { "input": "' OR '1'='1" }.
labRouter.post('/', async (req, res) => {
  const { input } = injectionInputSchema.parse(req.body);
  const result = await injectionDemo(input);
  res.json(result);
});
