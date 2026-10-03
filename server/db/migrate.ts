/**
 * Transactional, idempotent migration runner.
 *
 * - Tracks applied versions in schema_migrations(version PK, applied_at).
 * - Reads db/migrations/*.sql in filename order, skips already-applied.
 * - Applies each pending migration inside its own transaction:
 *   BEGIN -> run file -> record version -> COMMIT, ROLLBACK on any error.
 * - Safe to run twice: the second run is a no-op.
 *
 * CLI: `npm run db:migrate` (tsx). DATABASE_URL comes from server/.env
 * via the shared db.ts module (dotenv is loaded there on import).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../src/db.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Apply pending migrations; returns the versions applied in this run. */
export async function migrate(): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (` +
      `version text PRIMARY KEY, ` +
      `applied_at timestamptz NOT NULL DEFAULT now())`,
  );

  const appliedRows = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(appliedRows.rows.map((r) => r.version));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const pending = files
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((version) => !applied.has(version));

  if (pending.length === 0) {
    console.log('migrate: no pending migrations');
    return [];
  }

  const done: string[] = [];
  for (const version of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, `${version}.sql`), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        version,
      ]);
      await client.query('COMMIT');
      done.push(version);
      console.log(`migrate: applied ${version}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(
        `migration ${version} failed and was rolled back: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      client.release();
    }
  }
  return done;
}

async function main(): Promise<void> {
  try {
    const applied = await migrate();
    console.log(`migrate: done (${applied.length} applied)`);
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
