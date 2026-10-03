/**
 * Per-request SQL query log, backed by AsyncLocalStorage.
 *
 * Repository calls made inside `runWithQueryLog()` have their {sql, params,
 * durationMs} recorded automatically by the timed `query()` helper in db.ts.
 * The Query Inspector middleware wraps each request with runWithQueryLog and,
 * when DEMO_SQL_INSPECTOR=true and ?inspect=1, attaches the log as
 * meta.queries in the JSON response.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface QueryRecord {
  sql: string;
  params: unknown[];
  durationMs: number;
}

const storage = new AsyncLocalStorage<QueryRecord[]>();

/** Run fn with a fresh per-request query log; returns fn's return value. */
export function runWithQueryLog<T>(fn: () => T): T {
  return storage.run([], fn);
}

/** Append one executed query to the current request's log (no-op outside one). */
export function recordQuery(record: QueryRecord): void {
  storage.getStore()?.push(record);
}

/** Read the current request's query log (empty array outside a request). */
export function getQueryLog(): QueryRecord[] {
  return storage.getStore() ?? [];
}
