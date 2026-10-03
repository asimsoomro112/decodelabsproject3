import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  makeUser,
  makeInstructor,
  makeCourse,
  makeEnrollment,
  uniqueEmail,
  assertProblem,
  GHOST_UUID,
} from './setup.js';

describe('database constraints are the final source of truth', () => {
  test('UNIQUE: duplicate email (case-insensitive) -> 409 with a human message', async () => {
    const email = uniqueEmail('dup');
    const first = await api.post('/api/v1/users').send({ name: 'First', email, role: 'learner' });
    assert.equal(first.status, 201);
    const second = await api
      .post('/api/v1/users')
      .send({ name: 'Second', email: email.toUpperCase(), role: 'learner' });
    const body = assertProblem(second, 409);
    assert.match(String(body.detail), /already registered/i);
  });

  test('PK: duplicate enrollment (user_id, course_id) -> 409', async () => {
    const { course, learner } = await makeEnrollment();
    const res = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: learner.id });
    assertProblem(res, 409);
  });

  test('NOT NULL: missing email is caught by Zod -> 400', async () => {
    const res = await api.post('/api/v1/users').send({ name: 'No Email', role: 'learner' });
    const body = assertProblem(res, 400);
    assert.ok(
      (body.errors as { field?: string }[]).some((e) => e.field === 'email'),
      'errors[] should name the email field',
    );
  });

  test('CHECK: profile age 200 violates user_profiles_age_check -> 422', async () => {
    const user = await makeUser();
    const res = await api.put(`/api/v1/users/${user.id}/profile`).send({ age: 200 });
    const body = assertProblem(res, 422);
    assert.match(String(body.detail), /16.*100/);
  });

  test('CHECK (syntactic): role outside the enum is caught by Zod -> 400', async () => {
    const res = await api
      .post('/api/v1/users')
      .send({ name: 'Bad Role', email: uniqueEmail('role'), role: 'admin' });
    assertProblem(res, 400);
  });

  test('FK: enrolling a ghost learner -> 422 (referenced row does not exist)', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id);
    const res = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: GHOST_UUID });
    const body = assertProblem(res, 422);
    assert.match(String(body.detail), /does not exist/i);
  });

  test('FK: enrolling into a ghost course -> 404 (path resource missing)', async () => {
    const learner = await makeUser();
    const res = await api
      .post(`/api/v1/courses/${GHOST_UUID}/enrollments`)
      .send({ userId: learner.id });
    assertProblem(res, 404);
  });

  test('FK RESTRICT: deleting an instructor who still has courses -> 409', async () => {
    const instructor = await makeInstructor();
    await makeCourse(instructor.id);
    const res = await api.delete(`/api/v1/users/${instructor.id}`);
    const body = assertProblem(res, 409);
    assert.match(String(body.detail), /still teach|cannot delete/i);
    // And the instructor is still there.
    const get = await api.get(`/api/v1/users/${instructor.id}`);
    assert.equal(get.status, 200);
  });

  test('FK CASCADE: deleting a learner removes their enrollments', async () => {
    const { course, learner } = await makeEnrollment();
    const del = await api.delete(`/api/v1/users/${learner.id}`);
    assert.equal(del.status, 204);
    const roster = await api.get(`/api/v1/courses/${course.id}/enrollments`);
    assert.equal(roster.status, 200);
    assert.ok(
      !roster.body.data.some((e: { userId: string }) => e.userId === learner.id),
      'enrollment should have cascaded away',
    );
  });
});
