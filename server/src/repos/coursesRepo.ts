/**
 * Courses repository — ALL SQL for the courses table lives here.
 * Detail reads join the instructor and count active enrollments via a
 * scalar subquery so the shape is built in a single round trip.
 */
import { query } from '../db.js';
import { escapeLikePattern } from './usersRepo.js';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

export interface CourseDto {
  id: string;
  instructorId: string;
  title: string;
  description: string | null;
  level: CourseLevel;
  seats: number;
  startDate: string; // YYYY-MM-DD
  createdAt: string; // UTC ISO
  updatedAt: string; // UTC ISO
}

export interface InstructorRef {
  id: string;
  name: string;
  email: string;
}

export interface CourseDetailDto extends CourseDto {
  instructor: InstructorRef;
  enrolledCount: number;
}

export interface ListCoursesOptions {
  level?: string;
  q?: string;
  instructorId?: string;
  page?: number;
  limit?: number;
}

export interface CreateCourseInput {
  instructorId: string;
  title: string;
  description?: string | null;
  level: string;
  seats: number;
  startDate: string; // YYYY-MM-DD
}

export interface PatchCourseInput {
  title?: string;
  description?: string | null;
  level?: string;
  seats?: number;
  startDate?: string;
  instructorId?: string;
}

const COURSE_COLUMNS =
  'id, instructor_id, title, description, level, seats, start_date, created_at, updated_at';

interface CourseRow {
  id: string;
  instructor_id: string;
  title: string;
  description: string | null;
  level: string;
  seats: number;
  start_date: string | Date;
  created_at: Date;
  updated_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapCourse(row: CourseRow): CourseDto {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    title: row.title,
    description: row.description ?? null,
    level: row.level as CourseLevel,
    seats: Number(row.seats),
    startDate: toDateOnly(row.start_date),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listCourses(
  options: ListCoursesOptions = {},
): Promise<{ data: CourseDto[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, Math.floor(options.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20) || 20));

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.level) {
    params.push(options.level);
    conditions.push(`level = $${params.length}`);
  }
  if (options.instructorId) {
    params.push(options.instructorId);
    conditions.push(`instructor_id = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${escapeLikePattern(options.q)}%`);
    conditions.push(
      `(title ILIKE $${params.length} ESCAPE '\\\\' OR description ILIKE $${params.length} ESCAPE '\\\\')`,
    );
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM courses ${where}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (page - 1) * limit;
  const dataResult = await query<CourseRow>(
    `SELECT ${COURSE_COLUMNS} FROM courses ${where} ` +
      `ORDER BY start_date ASC, id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return { data: dataResult.rows.map(mapCourse), total, page, limit };
}

export async function createCourse(input: CreateCourseInput): Promise<CourseDto> {
  const result = await query<CourseRow>(
    `INSERT INTO courses (instructor_id, title, description, level, seats, start_date) ` +
      `VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COURSE_COLUMNS}`,
    [
      input.instructorId,
      input.title,
      input.description ?? null,
      input.level,
      input.seats,
      input.startDate,
    ],
  );
  return mapCourse(result.rows[0] as CourseRow);
}

interface CourseDetailRow extends CourseRow {
  ins_id: string;
  ins_name: string;
  ins_email: string;
  enrolled_count: string;
}

export async function getCourseById(id: string): Promise<CourseDetailDto | null> {
  const result = await query<CourseDetailRow>(
    `SELECT c.id, c.instructor_id, c.title, c.description, c.level, c.seats, ` +
      `c.start_date, c.created_at, c.updated_at, ` +
      `u.id AS ins_id, u.name AS ins_name, u.email AS ins_email, ` +
      `(SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS enrolled_count ` +
      `FROM courses c JOIN users u ON u.id = c.instructor_id ` +
      `WHERE c.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapCourse(row),
    instructor: { id: row.ins_id, name: row.ins_name, email: row.ins_email },
    enrolledCount: Number(row.enrolled_count),
  };
}

/** PUT semantics: full replace of every writable column. */
export async function updateCourse(
  id: string,
  input: CreateCourseInput,
): Promise<CourseDto | null> {
  const result = await query<CourseRow>(
    `UPDATE courses SET instructor_id = $1, title = $2, description = $3, level = $4, ` +
      `seats = $5, start_date = $6 WHERE id = $7 RETURNING ${COURSE_COLUMNS}`,
    [
      input.instructorId,
      input.title,
      input.description ?? null,
      input.level,
      input.seats,
      input.startDate,
      id,
    ],
  );
  const row = result.rows[0];
  return row ? mapCourse(row) : null;
}

/** DTO key -> column mapping for PATCH; only these columns can be set. */
const PATCHABLE_COURSE_COLUMNS: Record<string, string> = {
  title: 'title',
  description: 'description',
  level: 'level',
  seats: 'seats',
  startDate: 'start_date',
  instructorId: 'instructor_id',
};

export async function patchCourse(
  id: string,
  input: PatchCourseInput,
): Promise<CourseDto | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [dtoKey, column] of Object.entries(PATCHABLE_COURSE_COLUMNS)) {
    const value = (input as Record<string, unknown>)[dtoKey];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    const current = await query<CourseRow>(
      `SELECT ${COURSE_COLUMNS} FROM courses WHERE id = $1`,
      [id],
    );
    const row = current.rows[0];
    return row ? mapCourse(row) : null;
  }
  params.push(id);
  const result = await query<CourseRow>(
    `UPDATE courses SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COURSE_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapCourse(row) : null;
}

/**
 * May raise 23503 when ON DELETE RESTRICT blocks the delete — the caller
 * maps it to 409 via mapPgError(err, 'delete').
 */
export async function deleteCourse(id: string): Promise<boolean> {
  const result = await query('DELETE FROM courses WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
