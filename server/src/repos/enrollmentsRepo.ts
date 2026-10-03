/**
 * Enrollments repository — the M:M junction table between users and courses.
 *
 * createEnrollment runs in ONE transaction on a dedicated client:
 *   SELECT seats ... FOR UPDATE  ->  lock the course row so concurrent
 *   enrollments serialize here instead of overselling the last seat
 *   COUNT active enrollments     ->  reject with { code: 'SEATS_FULL' } (409)
 *   INSERT                       ->  duplicate PK surfaces as 23505 (409)
 *
 * Each statement inside the transaction is timed into the inspector log
 * manually, since the pooled `query()` helper cannot hold one client.
 */
import { query, getClient } from '../db.js';
import type { QueryResult, QueryResultRow } from 'pg';
import { recordQuery } from '../inspector.js';

export type EnrollmentStatus = 'active' | 'completed' | 'dropped';

export interface EnrollmentDto {
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt: string; // UTC ISO
}

export interface EnrollmentWithUserDto extends EnrollmentDto {
  user: { id: string; name: string; email: string; role: string };
}

export interface EnrollmentWithCourseDto extends EnrollmentDto {
  course: { id: string; title: string; level: string; seats: number; startDate: string };
}

const ENROLLMENT_COLUMNS = 'user_id, course_id, status, enrolled_at';

interface EnrollmentRow {
  user_id: string;
  course_id: string;
  status: string;
  enrolled_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapEnrollment(row: EnrollmentRow): EnrollmentDto {
  return {
    userId: row.user_id,
    courseId: row.course_id,
    status: row.status as EnrollmentStatus,
    enrolledAt: toIso(row.enrolled_at),
  };
}

interface EnrollmentUserRow extends EnrollmentRow {
  u_id: string;
  u_name: string;
  u_email: string;
  u_role: string;
}

export async function listEnrollmentsByCourse(
  courseId: string,
): Promise<EnrollmentWithUserDto[]> {
  const result = await query<EnrollmentUserRow>(
    `SELECT e.user_id, e.course_id, e.status, e.enrolled_at, ` +
      `u.id AS u_id, u.name AS u_name, u.email AS u_email, u.role AS u_role ` +
      `FROM enrollments e JOIN users u ON u.id = e.user_id ` +
      `WHERE e.course_id = $1 ` +
      `ORDER BY e.enrolled_at DESC, e.user_id ASC`,
    [courseId],
  );
  return result.rows.map((row) => ({
    ...mapEnrollment(row),
    user: { id: row.u_id, name: row.u_name, email: row.u_email, role: row.u_role },
  }));
}

interface EnrollmentCourseRow extends EnrollmentRow {
  c_id: string;
  c_title: string;
  c_level: string;
  c_seats: number;
  c_start_date: string | Date;
}

export async function listEnrollmentsByUser(
  userId: string,
): Promise<EnrollmentWithCourseDto[]> {
  const result = await query<EnrollmentCourseRow>(
    `SELECT e.user_id, e.course_id, e.status, e.enrolled_at, ` +
      `c.id AS c_id, c.title AS c_title, c.level AS c_level, c.seats AS c_seats, c.start_date AS c_start_date ` +
      `FROM enrollments e JOIN courses c ON c.id = e.course_id ` +
      `WHERE e.user_id = $1 ` +
      `ORDER BY e.enrolled_at DESC, e.course_id ASC`,
    [userId],
  );
  return result.rows.map((row) => ({
    ...mapEnrollment(row),
    course: {
      id: row.c_id,
      title: row.c_title,
      level: row.c_level,
      seats: Number(row.c_seats),
      startDate: toDateOnly(row.c_start_date),
    },
  }));
}

export async function createEnrollment(
  courseId: string,
  userId: string,
): Promise<EnrollmentDto> {
  const client = await getClient();
  const timed = async <T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> => {
    const start = performance.now();
    try {
      return await client.query<T>(text, params as any[]);
    } finally {
      recordQuery({ sql: text, params, durationMs: performance.now() - start });
    }
  };

  try {
    await timed('BEGIN');
    const courseResult = await timed<{ seats: number }>(
      'SELECT seats FROM courses WHERE id = $1 FOR UPDATE',
      [courseId],
    );
    const courseRow = courseResult.rows[0];
    if (!courseRow) {
      throw { code: 'COURSE_NOT_FOUND' };
    }
    const countResult = await timed<{ count: string }>(
      "SELECT COUNT(*) AS count FROM enrollments WHERE course_id = $1 AND status = 'active'",
      [courseId],
    );
    const active = Number(countResult.rows[0]?.count ?? 0);
    if (active >= Number(courseRow.seats)) {
      throw { code: 'SEATS_FULL' };
    }
    const insertResult = await timed<EnrollmentRow>(
      `INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) RETURNING ${ENROLLMENT_COLUMNS}`,
      [userId, courseId],
    );
    await timed('COMMIT');
    return mapEnrollment(insertResult.rows[0] as EnrollmentRow);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteEnrollment(
  courseId: string,
  userId: string,
): Promise<boolean> {
  const result = await query(
    'DELETE FROM enrollments WHERE course_id = $1 AND user_id = $2',
    [courseId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
