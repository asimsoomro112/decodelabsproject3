/**
 * PostgreSQL connection pool (native `pg` driver) + timed query helper.
 *
 * Pool tuning: max 10 clients, 30s idle timeout, 5s connection timeout,
 * and a 5s statement_timeout applied to every new connection.
 *
 * This module also owns dotenv loading so that CLI scripts (db/migrate.ts,
 * db/seed.ts, db/reset.ts) and the app share a single env-loading path:
 * importing anything from here guarantees DATABASE_URL has been read.
 */
import { config } from 'dotenv';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import pino from 'pino';
import { recordQuery } from './inspector.js';

config();

const logger = pino({ name: 'coursevault-db' });

/**
 * Managed Postgres providers (Neon, Supabase) require TLS. Their hosts are
 * detected here; a `?sslmode=require` query param is honored as well.
 * `rejectUnauthorized: false` is used because these providers terminate TLS
 * with certs the sandbox CA bundle may not chain to — no credentials or
 * query material ever flows through this decision.
 */
function resolveSsl(connectionString: string): PoolConfig['ssl'] {
  const lowered = connectionString.toLowerCase();
  if (lowered.includes('sslmode=require')) return { rejectUnauthorized: false };
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    if (host.endsWith('neon.tech') || host.includes('supabase.co')) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Not a parseable URL — fall through to no SSL.
  }
  return undefined;
}

export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.',
    );
  }
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: resolveSsl(connectionString),
  });
  pool.on('connect', (client: PoolClient) => {
    client.query("SET statement_timeout = '5s'").catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'failed to set statement_timeout on new client',
      );
    });
  });
  pool.on('error', (err: Error) => {
    // Idle-client errors (e.g. the server closed a connection). Log the
    // message only — never credentials — and keep the process alive.
    logger.error({ err: err.message }, 'unexpected idle pg client error');
  });
  return pool;
}

/** Shared pool for the application and CLI scripts. */
export const pool: Pool = createPool();

/**
 * Timed query helper used by every repository. Records {sql, params,
 * durationMs} into the AsyncLocalStorage-backed inspector log so the
 * Query Inspector can show the exact SQL behind each request.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = performance.now();
  try {
    return await pool.query<T>(text, params as any[]);
  } finally {
    recordQuery({
      sql: text,
      params: params ?? [],
      durationMs: performance.now() - start,
    });
  }
}

/** Borrow a dedicated client (e.g. for multi-statement transactions). */
export function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/** Drain the pool — call on SIGTERM/SIGINT for a clean shutdown. */
export async function closePool(): Promise<void> {
  await pool.end();
}
