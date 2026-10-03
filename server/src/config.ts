import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env before anything else reads process.env. In production the
// platform injects real env vars, so a missing .env file is fine.
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  // Primary connection string (local docker-compose or managed Neon/Supabase).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Optional: tests run against this when set, otherwise DATABASE_URL.
  TEST_DATABASE_URL: z.string().min(1).optional(),
  // Comma-separated allowlist, e.g. "http://localhost:5173,https://app.example.com"
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // SQL inspector demo flag. Inspector is active only when this is 'true'
  // AND the app is not running in production.
  DEMO_SQL_INSPECTOR: z.string().default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

const env = envSchema.parse(process.env);

export const config = {
  port: env.PORT,
  /** Effective connection string used by the pool, migrations and seed. */
  databaseUrl: env.TEST_DATABASE_URL ?? env.DATABASE_URL,
  rawDatabaseUrl: env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  demoSqlInspector: env.DEMO_SQL_INSPECTOR,
  /** The Query Inspector (?inspect=1) is a demo feature: never on in prod. */
  sqlInspectorEnabled: env.DEMO_SQL_INSPECTOR === 'true' && env.NODE_ENV !== 'production',
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;
