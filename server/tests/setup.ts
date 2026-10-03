import './env.js'; // must stay the first import (pins DATABASE_URL for src/db.js)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../db/migrate.js';
import { seed } from '../db/seed.js';
import { closePool } from '../src/db.js';

/**
 * Shared test harness. Every test file imports this module:
 *  - before(): migrate + seed (idempotent; sibling seed() wipes and reseeds,
 *    so each file starts from the same 3/12/8/30 dataset)
 *  - after(): closePool() so the process exits cleanly
 *
 * Requires a reachable Postgres: TEST_DATABASE_URL or DATABASE_URL.
 * (The sibling migrate()/seed() read the pool from src/db.js, which honors
 * the env.ts pin above.)
 */
export const app = createApp();
export const api = supertest(app);

before(async () => {
  try {
    await migrate();
    await seed();
  } catch (err) {
    throw new Error(
      'Test setup failed: Postgres is not reachable (migrate/seed threw). ' +
        'Set TEST_DATABASE_URL or DATABASE_URL to a running Postgres 17+. ' +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

after(async () => {
  await closePool();
});

// --- factories ------------------------------------------------------------------

let seq = 0;

export function uniqueEmail(prefix = 'tuser'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function uniqueTitle(prefix = 'Test Course'): string {
  seq += 1;
  return `${prefix} ${Date.now().toString(36)}-${seq}`;
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function makeUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const res = await api
    .post('/api/v1/users')
    .send({ name: 'Test User', email: uniqueEmail(), role: 'learner', ...overrides });
  assert.equal(res.status, 201, `makeUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as TestUser;
}

export async function makeInstructor(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  return makeUser({
    name: 'Test Instructor',
    email: uniqueEmail('instructor'),
    role: 'instructor',
    ...overrides,
  });
}

export interface TestCourse {
  id: string;
  instructorId: string;
  title: string;
  seats: number;
}

export async function makeCourse(
  instructorId: string,
  overrides: Record<string, unknown> = {},
): Promise<TestCourse> {
  const res = await api.post('/api/v1/courses').send({
    instructorId,
    title: uniqueTitle(),
    description: 'A test course.',
    level: 'beginner',
    seats: 10,
    startDate: '2026-12-01',
    ...overrides,
  });
  assert.equal(res.status, 201, `makeCourse failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as TestCourse;
}

/** A learner enrolled in a course (fresh instructor + course + learner). */
export async function makeEnrollment(seats = 10): Promise<{
  instructor: TestUser;
  course: TestCourse;
  learner: TestUser;
}> {
  const instructor = await makeInstructor();
  const course = await makeCourse(instructor.id, { seats });
  const learner = await makeUser();
  const res = await api
    .post(`/api/v1/courses/${course.id}/enrollments`)
    .send({ userId: learner.id });
  assert.equal(res.status, 201, `makeEnrollment failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { instructor, course, learner };
}

// --- problem+json assertions -----------------------------------------------------

export function assertProblem(
  res: supertest.Response,
  expectedStatus: number,
): Record<string, unknown> {
  assert.equal(res.status, expectedStatus, `expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.match(res.headers['content-type'] ?? '', /application\/problem\+json/);
  const body = res.body as Record<string, unknown>;
  for (const key of ['type', 'title', 'status', 'detail', 'instance', 'requestId', 'errors']) {
    assert.ok(key in body, `problem+json missing key: ${key}`);
  }
  assert.equal(body.status, expectedStatus);
  assert.ok(typeof body.type === 'string' && body.type.startsWith('https://coursevault.dev/problems/'));
  assert.ok(typeof body.requestId === 'string' && (body.requestId as string).length > 0);
  assert.ok(Array.isArray(body.errors));
  // Never leak SQL text, stack traces or credentials.
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('"sql"'), 'leaked "sql" key');
  assert.ok(!/at\s+file:\/\//.test(serialized), 'possible stack trace leak');
  assert.ok(!/\.ts:\d+/.test(serialized), 'possible stack trace leak');
  return body;
}

export const GHOST_UUID = '123e4567-e89b-12d3-a456-426614174000';
