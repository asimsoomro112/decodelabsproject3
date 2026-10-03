/**
 * Idempotent seed script.
 *
 * Wraps everything in ONE transaction: deletes existing rows in FK-safe
 * order (enrollments -> courses -> user_profiles -> users), then inserts
 * 3 instructors, 12 learners, 8 courses and 30 enrollments with mixed
 * statuses. Re-running produces the same database state.
 *
 * CLI: `npm run db:seed` (tsx). All inserts are parameterized.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClient, closePool } from '../src/db.js';
import { recordQuery } from '../src/inspector.js';

interface SeedUser {
  name: string;
  email: string;
  role: 'instructor' | 'learner';
}

interface SeedCourse {
  title: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  seats: number;
  startDate: string; // YYYY-MM-DD
  instructorEmail: string;
}

const INSTRUCTORS: SeedUser[] = [
  { name: 'Ada Lovelace', email: 'ada@coursevault.dev', role: 'instructor' },
  { name: 'Grace Hopper', email: 'grace@coursevault.dev', role: 'instructor' },
  { name: 'Alan Turing', email: 'alan@coursevault.dev', role: 'instructor' },
];

const LEARNERS: SeedUser[] = [
  { name: 'Marie Curie', email: 'marie@coursevault.dev', role: 'learner' },
  { name: 'Nikola Tesla', email: 'nikola@coursevault.dev', role: 'learner' },
  { name: 'Katherine Johnson', email: 'katherine@coursevault.dev', role: 'learner' },
  { name: 'Margaret Hamilton', email: 'margaret@coursevault.dev', role: 'learner' },
  { name: 'Dorothy Vaughan', email: 'dorothy@coursevault.dev', role: 'learner' },
  { name: 'Anita Borg', email: 'anita@coursevault.dev', role: 'learner' },
  { name: 'Barbara Liskov', email: 'barbara@coursevault.dev', role: 'learner' },
  { name: 'Frances Allen', email: 'frances@coursevault.dev', role: 'learner' },
  { name: 'Annie Easley', email: 'annie@coursevault.dev', role: 'learner' },
  { name: 'Hedy Lamarr', email: 'hedy@coursevault.dev', role: 'learner' },
  { name: 'Radia Perlman', email: 'radia@coursevault.dev', role: 'learner' },
  { name: 'Sophie Wilson', email: 'sophie@coursevault.dev', role: 'learner' },
];

const COURSES: SeedCourse[] = [
  {
    title: 'SQL Foundations',
    description: 'Relational thinking, SELECT, joins and aggregations from zero.',
    level: 'beginner',
    seats: 40,
    startDate: '2026-11-01',
    instructorEmail: 'ada@coursevault.dev',
  },
  {
    title: 'PostgreSQL Deep Dive',
    description: 'Indexes, transactions, locking and query plans in production Postgres.',
    level: 'advanced',
    seats: 25,
    startDate: '2026-12-01',
    instructorEmail: 'ada@coursevault.dev',
  },
  {
    title: 'REST API Design',
    description: 'Resource modeling, status codes, versioning and pragmatic API craft.',
    level: 'intermediate',
    seats: 30,
    startDate: '2026-11-15',
    instructorEmail: 'grace@coursevault.dev',
  },
  {
    title: 'TypeScript Mastery',
    description: 'Types, generics, narrowing and strict-mode patterns for real codebases.',
    level: 'intermediate',
    seats: 35,
    startDate: '2026-11-10',
    instructorEmail: 'alan@coursevault.dev',
  },
  {
    title: 'Database Indexing Lab',
    description: 'B-tree internals, EXPLAIN ANALYZE and index design by measurement.',
    level: 'advanced',
    seats: 20,
    startDate: '2027-01-15',
    instructorEmail: 'grace@coursevault.dev',
  },
  {
    title: 'Intro to Git & GitHub',
    description: 'Commits, branches, pull requests and collaboration workflows.',
    level: 'beginner',
    seats: 50,
    startDate: '2026-10-20',
    instructorEmail: 'alan@coursevault.dev',
  },
  {
    title: 'Node.js Backend Bootcamp',
    description: 'Event loop, Express, middleware and shipping your first API.',
    level: 'beginner',
    seats: 45,
    startDate: '2026-11-25',
    instructorEmail: 'grace@coursevault.dev',
  },
  {
    title: 'Data Modeling Workshop',
    description: 'ER design, normalization trade-offs and schema reviews.',
    level: 'advanced',
    seats: 15,
    startDate: '2027-02-01',
    instructorEmail: 'alan@coursevault.dev',
  },
];

type EnrollmentStatus = 'active' | 'completed' | 'dropped';

function enrollmentStatus(learnerIdx: number, courseIdx: number): EnrollmentStatus {
  const m = (learnerIdx + courseIdx) % 5;
  if (m === 0) return 'dropped';
  if (m === 1) return 'completed';
  return 'active';
}

/** Seed the database inside a single transaction. */
export async function seed(): Promise<void> {
  const client = await getClient();
  const timed = async (text: string, params: unknown[] = []) => {
    const start = performance.now();
    try {
      return await client.query(text, params as any[]);
    } finally {
      recordQuery({ sql: text, params, durationMs: performance.now() - start });
    }
  };

  try {
    await timed('BEGIN');

    // FK-safe delete order: junction first, then dependents, then users.
    await timed('DELETE FROM enrollments');
    await timed('DELETE FROM courses');
    await timed('DELETE FROM user_profiles');
    await timed('DELETE FROM users');

    const userIds = new Map<string, string>();
    for (const u of [...INSTRUCTORS, ...LEARNERS]) {
      const res = await timed(
        'INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id',
        [u.name, u.email, u.role],
      );
      userIds.set(u.email, res.rows[0].id as string);
    }

    const courseIds: string[] = [];
    for (const c of COURSES) {
      const instructorId = userIds.get(c.instructorEmail);
      if (!instructorId) throw new Error(`seed: unknown instructor ${c.instructorEmail}`);
      const res = await timed(
        'INSERT INTO courses (instructor_id, title, description, level, seats, start_date) ' +
          'VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [instructorId, c.title, c.description, c.level, c.seats, c.startDate],
      );
      courseIds.push(res.rows[0].id as string);
    }

    // Deterministic spread: every learner takes 2 courses, the first six take
    // a third — 12*2 + 6 = 30 enrollments, statuses mixed by index math.
    let enrollmentCount = 0;
    const seen = new Set<string>();
    const addEnrollment = async (learnerIdx: number, courseIdx: number) => {
      const key = `${learnerIdx}:${courseIdx}`;
      if (seen.has(key)) return;
      seen.add(key);
      const userId = userIds.get(LEARNERS[learnerIdx]?.email ?? '');
      const courseId = courseIds[courseIdx];
      if (!userId || !courseId) throw new Error('seed: bad enrollment indexes');
      await timed('INSERT INTO enrollments (user_id, course_id, status) VALUES ($1, $2, $3)', [
        userId,
        courseId,
        enrollmentStatus(learnerIdx, courseIdx),
      ]);
      enrollmentCount++;
    };
    for (let i = 0; i < LEARNERS.length; i++) {
      await addEnrollment(i, i % COURSES.length);
      await addEnrollment(i, (i + 3) % COURSES.length);
      if (i < 6) await addEnrollment(i, (i + 5) % COURSES.length);
    }

    await timed('COMMIT');
    console.log(
      `seed: inserted ${INSTRUCTORS.length} instructors, ${LEARNERS.length} learners, ` +
        `${COURSES.length} courses, ${enrollmentCount} enrollments`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  try {
    await seed();
  } finally {
    await closePool();
  }
}

const isMainEntry =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainEntry) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
