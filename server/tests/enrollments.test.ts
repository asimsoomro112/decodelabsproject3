import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  makeUser,
  makeInstructor,
  makeCourse,
  makeEnrollment,
  assertProblem,
} from './setup.js';

describe('enrollments (M:M junction)', () => {
  test('POST /courses/:id/enrollments -> 201 + Location', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id);
    const learner = await makeUser();
    const res = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: learner.id });
    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/api/v1/courses/${course.id}/enrollments/${learner.id}`);
    assert.equal(res.body.data.userId, learner.id);
    assert.equal(res.body.data.courseId, course.id);
    assert.equal(res.body.data.status, 'active');
  });

  test('GET /courses/:id/enrollments lists the roster with learner details', async () => {
    const { course, learner } = await makeEnrollment();
    const res = await api.get(`/api/v1/courses/${course.id}/enrollments`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    const row = res.body.data.find((e: { userId: string }) => e.userId === learner.id);
    assert.ok(row, 'enrolled learner missing from roster');
    assert.equal(row.user.email, learner.email);
  });

  test('GET /users/:id/enrollments lists enrollments with course details', async () => {
    const { course, learner } = await makeEnrollment();
    const res = await api.get(`/api/v1/users/${learner.id}/enrollments`);
    assert.equal(res.status, 200);
    const row = res.body.data.find((e: { courseId: string }) => e.courseId === course.id);
    assert.ok(row, 'enrollment missing from learner view');
    assert.equal(row.course.title, course.title);
  });

  test('DELETE /courses/:id/enrollments/:userId -> 204', async () => {
    const { course, learner } = await makeEnrollment();
    const del = await api.delete(`/api/v1/courses/${course.id}/enrollments/${learner.id}`);
    assert.equal(del.status, 204);
    const roster = await api.get(`/api/v1/courses/${course.id}/enrollments`);
    assert.ok(!roster.body.data.some((e: { userId: string }) => e.userId === learner.id));
  });

  test('capacity: last seat fills, next enrollment -> 409', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id, { seats: 1 });
    const first = await makeUser();
    const second = await makeUser();
    const ok = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: first.id });
    assert.equal(ok.status, 201);
    const full = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: second.id });
    const body = assertProblem(full, 409);
    assert.match(String(body.detail), /full/i);
  });

  test('duplicate enrollment -> 409 (composite PK)', async () => {
    const { course, learner } = await makeEnrollment();
    const res = await api
      .post(`/api/v1/courses/${course.id}/enrollments`)
      .send({ userId: learner.id });
    const body = assertProblem(res, 409);
    assert.match(String(body.detail), /already enrolled/i);
  });
});
