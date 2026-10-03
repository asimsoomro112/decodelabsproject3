/**
 * Full database reset: drops schema_migrations and all four tables
 * (CASCADE), then re-runs the migration runner and the seed script.
 *
 * CLI: `npm run db:reset` (tsx). Destructive — dev/test databases only.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from '../src/db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/** Fixed identifiers — never user input. Drop order is irrelevant (CASCADE). */
const TABLES = ['enrollments', 'courses', 'user_profiles', 'users'] as const;

export async function reset(): Promise<void> {
  for (const table of TABLES) {
    await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  await query('DROP TABLE IF EXISTS schema_migrations');
  console.log('reset: dropped all tables');

  await migrate();
  await seed();
  console.log('reset: complete');
}

async function main(): Promise<void> {
  try {
    await reset();
  } finally {
    await closePool();
  }
}

const isMainEntry =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainEntry) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
