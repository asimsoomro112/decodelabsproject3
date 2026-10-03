import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, makeUser, assertProblem } from './setup.js';

describe('user profiles (1:1)', () => {
  test('PUT /users/:id/profile upserts -> 200', async () => {
    const user = await makeUser();
    const res = await api
      .put(`/api/v1/users/${user.id}/profile`)
      .send({ bio: 'Loves databases.', country: 'Pakistan', age: 24 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.userId, user.id);
    assert.equal(res.body.data.bio, 'Loves databases.');
    assert.equal(res.body.data.age, 24);

    // Second PUT replaces (upsert, not duplicate).
    const res2 = await api
      .put(`/api/v1/users/${user.id}/profile`)
      .send({ bio: 'Updated bio.', country: null, age: null });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.bio, 'Updated bio.');
    assert.equal(res2.body.data.age, null);
  });

  test('GET /users/:id/profile returns the profile', async () => {
    const user = await makeUser();
    await api.put(`/api/v1/users/${user.id}/profile`).send({ country: 'Spain' });
    const res = await api.get(`/api/v1/users/${user.id}/profile`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.country, 'Spain');
  });

  test('PUT /users/:id/profile with age 200 -> 422 (DB CHECK, final source of truth)', async () => {
    const user = await makeUser();
    const res = await api
      .put(`/api/v1/users/${user.id}/profile`)
      .send({ age: 200 });
    const body = assertProblem(res, 422);
    assert.match(String(body.detail), /16.*100|between/i);
  });
});
