/**
 * Imported FIRST by tests/setup.ts, before anything that touches src/db.js.
 *
 * The shared pg pool reads process.env.DATABASE_URL at module-evaluation
 * time. When TEST_DATABASE_URL is set (CI / local test runs), pin
 * DATABASE_URL to it so the app, the migration runner and the seed script
 * all hit the test database.
 */
if (process.env.TEST_DATABASE_URL && !process.env.COURSEVAULT_TEST_DB_PINNED) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.COURSEVAULT_TEST_DB_PINNED = '1';
}

export {};
