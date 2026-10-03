import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, assertProblem } from './setup.js';

describe('system, stats, schema, docs and error shape', () => {
  test('GET /api/v1/health -> { status: ok, version, uptime }', async () => {
    const res = await api.get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.version, '1.0.0');
    assert.ok(typeof res.body.uptime === 'number');
  });

  test('GET /api/v1/ready -> { status: ready } (SELECT 1)', async () => {
    const res = await api.get('/api/v1/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
  });

  test('GET /api/v1/stats returns JOIN + GROUP BY aggregates', async () => {
    const res = await api.get('/api/v1/stats');
    assert.equal(res.status, 200);
    const s = res.body.data;
    assert.ok(s.totals.users >= 15);
    assert.ok(s.totals.courses >= 8);
    assert.ok(Array.isArray(s.coursesPerLevel) && s.coursesPerLevel.length >= 1);
    assert.ok(typeof s.fillRate.fillRatePct === 'number');
    assert.ok(s.fillRate.fillRatePct >= 0 && s.fillRate.fillRatePct <= 100);
    assert.ok(Array.isArray(s.topCourses) && s.topCourses.length >= 1);
    assert.ok(typeof s.topCourses[0].enrolledCount === 'number');
  });

  test('GET /api/v1/schema exposes the four tables with keys', async () => {
    const res = await api.get('/api/v1/schema');
    assert.equal(res.status, 200);
    const tables = res.body.data.tables as {
      name: string;
      primaryKey: string[];
      foreignKeys: { name: string; columns: string[]; refTable: string }[];
      checks: { name: string }[];
      indexes: { name: string }[];
    }[];
    const names = tables.map((t) => t.name).sort();
    assert.deepEqual(names, ['courses', 'enrollments', 'user_profiles', 'users']);
    const users = tables.find((t) => t.name === 'users')!;
    assert.deepEqual(users.primaryKey, ['id']);
    assert.ok(users.checks.some((c) => c.name === 'users_name_check'));
    assert.ok(users.indexes.some((i) => i.name === 'users_email_unique'));
    const enrollments = tables.find((t) => t.name === 'enrollments')!;
    assert.equal(enrollments.foreignKeys.length, 2, 'M:M junction has two FKs');
    assert.deepEqual(enrollments.primaryKey.sort(), ['course_id', 'user_id']);
  });

  test('GET /openapi.json is a valid OpenAPI 3.1 document', async () => {
    const res = await api.get('/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(res.body.openapi, '3.1.0');
    assert.equal(res.body.info.title, 'CourseVault API');
    for (const p of ['/users', '/users/{id}', '/courses', '/courses/{id}', '/stats', '/schema', '/lab/injection-demo']) {
      assert.ok(res.body.paths[p], `missing path ${p}`);
    }
    assert.ok(res.body.components.schemas.Problem, 'missing Problem schema');
  });

  test('unknown route -> 404 problem+json', async () => {
    const res = await api.get('/api/v1/nope');
    assertProblem(res, 404);
  });

  test('validation failures are RFC 9457 problem+json with requestId', async () => {
    const res = await api.post('/api/v1/users').send({});
    const body = assertProblem(res, 400);
    assert.ok((body.errors as unknown[]).length >= 1);
    // X-Request-Id is on every response, including errors.
    assert.ok(res.headers['x-request-id'], 'missing X-Request-Id header');
    assert.equal(res.headers['x-request-id'], body.requestId);
  });

  test('every response carries X-Request-Id', async () => {
    const res = await api.get('/api/v1/health');
    assert.ok(res.headers['x-request-id'], 'missing X-Request-Id header');
  });

  test('?inspect=1 adds nothing when the inspector is disabled', async () => {
    const res = await api.get('/api/v1/users?inspect=1&limit=1');
    assert.equal(res.status, 200);
    assert.ok(!res.body.meta?.queries, 'inspector should be off without DEMO_SQL_INSPECTOR=true');
  });

  test('POST /lab/injection-demo returns the naive-vs-parameterized comparison', async () => {
    const res = await api.post('/api/v1/lab/injection-demo').send({ input: 'Ada' });
    assert.equal(res.status, 200);
    assert.ok(String(res.body.naiveQueryWouldBe).includes('Ada'));
    assert.ok(String(res.body.parameterizedQuery).includes('$1'));
    assert.equal(res.body.executed, 'parameterized');
    assert.ok(Array.isArray(res.body.params));
    assert.ok(typeof res.body.rowsReturned === 'number');
    assert.ok(Array.isArray(res.body.rows));
  });
});
