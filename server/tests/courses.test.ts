import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  api,
  makeUser,
  makeInstructor,
  makeCourse,
  uniqueTitle,
  assertProblem,
  GHOST_UUID,
} from './setup.js';

describe('courses CRUD', () => {
  test('POST /courses -> 201 + Location header', async () => {
    const instructor = await makeInstructor();
    const res = await api.post('/api/v1/courses').send({
      instructorId: instructor.id,
      title: uniqueTitle('Postgres'),
      description: 'Learn Postgres.',
      level: 'beginner',
      seats: 40,
      startDate: '2026-11-10',
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/api/v1/courses/${res.body.data.id}`);
    assert.equal(res.body.data.seats, 40);
    assert.equal(res.body.data.startDate, '2026-11-10');
  });

  test('GET /courses?level=beginner filters by level', async () => {
    const res = await api.get('/api/v1/courses?level=beginner&limit=50');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    for (const c of res.body.data) assert.equal(c.level, 'beginner');
  });

  test('GET /courses/:id includes instructor and enrolledCount', async () => {
    const instructor = await makeInstructor({ name: 'Count Instructor' });
    const course = await makeCourse(instructor.id, { seats: 5 });
    const learner = await makeUser();
    await api.post(`/api/v1/courses/${course.id}/enrollments`).send({ userId: learner.id });
    const res = await api.get(`/api/v1/courses/${course.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.instructor.name, 'Count Instructor');
    assert.equal(res.body.data.instructor.id, instructor.id);
    assert.equal(res.body.data.enrolledCount, 1);
  });

  test('PATCH /courses/:id partially updates', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id);
    const res = await api.patch(`/api/v1/courses/${course.id}`).send({ seats: 99 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.seats, 99);
    assert.equal(res.body.data.title, course.title);
  });

  test('PUT /courses/:id fully replaces', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id);
    const title = uniqueTitle('Replaced');
    const res = await api.put(`/api/v1/courses/${course.id}`).send({
      instructorId: instructor.id,
      title,
      description: null,
      level: 'advanced',
      seats: 20,
      startDate: '2027-01-01',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, title);
    assert.equal(res.body.data.level, 'advanced');
  });

  test('DELETE /courses/:id -> 204', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id);
    const del = await api.delete(`/api/v1/courses/${course.id}`);
    assert.equal(del.status, 204);
    const get = await api.get(`/api/v1/courses/${course.id}`);
    assertProblem(get, 404);
  });

  test('POST /courses with a learner as instructor -> 422 (DB trigger)', async () => {
    const learner = await makeUser();
    const res = await api.post('/api/v1/courses').send({
      instructorId: learner.id,
      title: uniqueTitle('Learner Taught'),
      level: 'beginner',
      seats: 10,
      startDate: '2026-12-01',
    });
    const body = assertProblem(res, 422);
    assert.match(String(body.detail), /instructor/i);
  });

  test('POST /courses duplicate (instructorId, title) -> 409', async () => {
    const instructor = await makeInstructor();
    const title = uniqueTitle('Unique Title');
    const payload = {
      instructorId: instructor.id,
      title,
      level: 'beginner',
      seats: 10,
      startDate: '2026-12-01',
    };
    const first = await api.post('/api/v1/courses').send(payload);
    assert.equal(first.status, 201);
    const second = await api.post('/api/v1/courses').send(payload);
    const body = assertProblem(second, 409);
    assert.match(String(body.detail), /already has a course/i);
  });

  test('GET /courses/:id unknown UUID -> 404', async () => {
    const res = await api.get(`/api/v1/courses/${GHOST_UUID}`);
    assertProblem(res, 404);
  });
});
