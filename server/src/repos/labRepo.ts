/**
 * Injection Lab repository.
 *
 * Builds the naive string-interpolated query for DISPLAY ONLY and executes
 * ONLY the parameterized version. The naive string is never sent to the
 * database — constructing the string is harmless, executing it is not.
 */
import { query } from '../db.js';
import { escapeLikePattern } from './usersRepo.js';

export interface InjectionDemoRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface InjectionDemoResult {
  naiveQueryWouldBe: string;
  parameterizedQuery: string;
  params: string[];
  executed: 'parameterized';
  rowsReturned: number;
  rows: InjectionDemoRow[];
}

/** Hard cap on scanned rows; only the first few are returned to the client. */
const SCAN_LIMIT = 25;
const RETURN_LIMIT = 5;

export async function injectionDemo(input: string): Promise<InjectionDemoResult> {
  // DISPLAY ONLY — this string is never executed.
  const naiveQueryWouldBe = `SELECT id, name, email FROM users WHERE name ILIKE '%${input}%'`;

  // What actually runs: a bound parameter with LIKE metacharacters escaped.
  // SCAN_LIMIT is a numeric constant, not user input.
  const pattern = `%${escapeLikePattern(input)}%`;
  const parameterizedQuery =
    `SELECT id, name, email, role FROM users WHERE name ILIKE $1 ESCAPE '\\\\' ` +
    `ORDER BY name ASC LIMIT ${SCAN_LIMIT}`;
  const result = await query<InjectionDemoRow>(parameterizedQuery, [pattern]);

  return {
    naiveQueryWouldBe,
    parameterizedQuery,
    params: [pattern],
    executed: 'parameterized',
    rowsReturned: result.rows.length,
    rows: result.rows.slice(0, RETURN_LIMIT),
  };
}
