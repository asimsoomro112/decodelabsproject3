import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, makeUser, makeInstructor, makeCourse } from './setup.js';

describe('enrollment race on the last seat', () => {
  test('8 parallel enrollments on a 1-seat course: exactly one 201, seven 409', async () => {
    const instructor = await makeInstructor();
    const course = await makeCourse(instructor.id, { seats: 1 });
    const learners = await Promise.all(Array.from({ length: 8 }, () => makeUser()));

    // Fire all eight at once — the SELECT ... FOR UPDATE serializes them.
    const results = await Promise.all(
      learners.map((learner) =>
        api.post(`/api/v1/courses/${course.id}/enrollments`).send({ userId: learner.id }),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    assert.equal(created.length, 1, `expected exactly one 201, got ${created.length}`);
    assert.equal(rejected.length, 7, `expected seven 409s, got ${rejected.length}`);

    const detail = await api.get(`/api/v1/courses/${course.id}`);
    assert.equal(detail.body.data.enrolledCount, 1, 'course must never be oversold');
  });
});
