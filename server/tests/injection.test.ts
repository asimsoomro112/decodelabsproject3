import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, uniqueEmail, assertProblem } from './setup.js';

const PAYLOADS = ["' OR '1'='1", "' OR 1=1 --", "'; DROP TABLE users; --"];

describe('SQL injection resistance (everything stays parameterized)', () => {
  test('injection payloads in ?q= return only literal matches, never all rows', async () => {
    const all = await api.get('/api/v1/users?limit=100');
    const total = all.body.meta.total as number;
    assert.ok(total >= 15);

    for (const payload of PAYLOADS) {
      const res = await api.get('/api/v1/users').query({ q: payload, limit: 100 });
      assert.equal(res.status, 200, `payload rejected outright: ${payload}`);
      const returned = res.body.meta.total as number;
      assert.ok(
        returned < total,
        `payload "${payload}" leaked rows: ${returned} of ${total}`,
      );
      for (const u of res.body.data as { name: string; email: string }[]) {
        const hay = `${u.name} ${u.email}`;
        assert.ok(
          hay.includes(payload),
          `row does not literally match the payload: ${hay}`,
        );
      }
    }
  });

  test("'; DROP TABLE users; -- in ?q= does not touch the table", async () => {
    const before = await api.get('/api/v1/users?limit=1');
    const beforeTotal = before.body.meta.total;
    const res = await api.get('/api/v1/users').query({ q: "'; DROP TABLE users; --" });
    assert.equal(res.status, 200);
    const after = await api.get('/api/v1/users?limit=1');
    assert.equal(after.status, 200, 'users table is gone!');
    assert.equal(after.body.meta.total, beforeTotal, 'row count changed');
  });

  test("'; DROP TABLE users; -- as a name is stored literally, table intact", async () => {
    const payload = "'; DROP TABLE users; --";
    const created = await api
      .post('/api/v1/users')
      .send({ name: payload, email: uniqueEmail('inj'), role: 'learner' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.name, payload);
    const probe = await api.get('/api/v1/users?limit=1');
    assert.equal(probe.status, 200, 'users table is gone!');
  });

  test('injection payloads in the Lab return only literal matches', async () => {
    for (const payload of PAYLOADS) {
      const res = await api.post('/api/v1/lab/injection-demo').send({ input: payload });
      assert.equal(res.status, 200);
      assert.equal(res.body.executed, 'parameterized');
      assert.ok(
        String(res.body.naiveQueryWouldBe).includes(payload),
        'naive display query should show the raw payload',
      );
      assert.ok(
        !String(res.body.parameterizedQuery).includes(payload),
        'parameterized query must not contain raw input',
      );
      assert.ok(
        (res.body.rows as { name: string }[]).every((r) => r.name.includes(payload)),
        `lab leaked rows for payload: ${payload}`,
      );
    }
  });

  test('lab rejects over-long input with problem+json', async () => {
    const res = await api
      .post('/api/v1/lab/injection-demo')
      .send({ input: 'x'.repeat(201) });
    assertProblem(res, 400);
  });
});
