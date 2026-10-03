import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, makeUser, makeInstructor, uniqueEmail, assertProblem, GHOST_UUID } from './setup.js';

describe('users CRUD', () => {
  test('POST /users -> 201 + Location header + camelCase DTO', async () => {
    const res = await api
      .post('/api/v1/users')
      .send({ name: 'Sara Ahmed', email: uniqueEmail('sara'), role: 'instructor' });
    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/api/v1/users/${res.body.data.id}`);
    assert.match(res.body.data.id, /^[0-9a-f-]{36}$/);
    assert.equal(res.body.data.name, 'Sara Ahmed');
    assert.equal(res.body.data.role, 'instructor');
    assert.ok(res.body.data.createdAt.endsWith('Z'));
    assert.ok(!('created_at' in res.body.data), 'snake_case leaked');
  });

  test('GET /users returns paginated envelope with total', async () => {
    const res = await api.get('/api/v1/users?limit=5');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.meta.limit, 5);
    assert.ok(res.body.meta.total >= 15, 'seed has 3 instructors + 12 learners');
    assert.equal(res.body.meta.totalPages, Math.ceil(res.body.meta.total / 5));
  });

  test('GET /users?role=instructor filters by role', async () => {
    const res = await api.get('/api/v1/users?role=instructor&limit=50');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 3);
    for (const u of res.body.data) assert.equal(u.role, 'instructor');
  });

  test('GET /users?q= searches name and email (ILIKE)', async () => {
    const learner = await makeUser({ name: 'Zxq Searchable', email: uniqueEmail('zxq') });
    const res = await api.get('/api/v1/users?q=zxq&limit=50');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.some((u: { id: string }) => u.id === learner.id));
    for (const u of res.body.data) {
      assert.ok(
        u.name.toLowerCase().includes('zxq') || u.email.toLowerCase().includes('zxq'),
        'unrelated row returned',
      );
    }
  });

  test('GET /users/:id returns the user with embedded profile', async () => {
    const instructor = await makeInstructor();
    await api.put(`/api/v1/users/${instructor.id}/profile`).send({ bio: 'Teaches SQL.', age: 40 });
    const res = await api.get(`/api/v1/users/${instructor.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, instructor.id);
    assert.equal(res.body.data.profile.bio, 'Teaches SQL.');
    assert.equal(res.body.data.profile.age, 40);
  });

  test('PATCH /users/:id partially updates', async () => {
    const user = await makeUser({ name: 'Old Name' });
    const res = await api.patch(`/api/v1/users/${user.id}`).send({ name: 'New Name' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'New Name');
    assert.equal(res.body.data.email, user.email);
  });

  test('PUT /users/:id fully replaces', async () => {
    const user = await makeUser();
    const res = await api.put(`/api/v1/users/${user.id}`).send({
      name: 'Replaced Person',
      email: uniqueEmail('replaced'),
      role: 'instructor',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Replaced Person');
    assert.equal(res.body.data.role, 'instructor');
  });

  test('DELETE /users/:id -> 204, then GET -> 404', async () => {
    const user = await makeUser();
    const del = await api.delete(`/api/v1/users/${user.id}`);
    assert.equal(del.status, 204);
    assert.equal(del.text, '');
    const get = await api.get(`/api/v1/users/${user.id}`);
    assertProblem(get, 404);
  });

  test('GET /users/:id with a malformed UUID -> 400 problem+json', async () => {
    const res = await api.get('/api/v1/users/not-a-uuid');
    assertProblem(res, 400);
  });

  test('GET /users/:id with an unknown UUID -> 404 problem+json', async () => {
    const res = await api.get(`/api/v1/users/${GHOST_UUID}`);
    const body = assertProblem(res, 404);
    assert.match(String(body.detail), /not found/i);
  });
});
