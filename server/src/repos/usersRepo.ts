/**
 * Users repository — ALL SQL for the users table lives here.
 * No SELECT *; explicit columns; snake_case rows mapped to camelCase DTOs.
 */
import { query } from '../db.js';

export type UserRole = 'learner' | 'instructor';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDto {
  userId: string;
  bio: string | null;
  country: string | null;
  age: number | null;
  updatedAt: string;
}

export interface UserWithProfileDto extends UserDto {
  profile: ProfileDto | null;
}

export interface ListUsersOptions {
  role?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: string;
}

const USER_COLUMNS = 'id, name, email, role, created_at, updated_at';

/** Profile columns selected with a p_ prefix when joined onto users. */
const PROFILE_SELECT =
  'p.user_id AS p_user_id, p.bio AS p_bio, p.country AS p_country, ' +
  'p.age AS p_age, p.updated_at AS p_updated_at';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Escape LIKE metacharacters so free-text search matches literally.
 * Applied to the bound parameter — the query itself stays parameterized,
 * so this is about correct semantics, not injection (params can't inject).
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function mapUser(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapJoinedProfile(row: Record<string, unknown>): ProfileDto | null {
  if (row['p_user_id'] == null) return null;
  return {
    userId: row['p_user_id'] as string,
    bio: (row['p_bio'] as string | null) ?? null,
    country: (row['p_country'] as string | null) ?? null,
    age: (row['p_age'] as number | null) ?? null,
    updatedAt: toIso(row['p_updated_at'] as Date),
  };
}

export async function listUsers(
  options: ListUsersOptions = {},
): Promise<{ data: UserDto[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, Math.floor(options.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20) || 20));

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.role) {
    params.push(options.role);
    conditions.push(`role = $${params.length}`);
  }
  if (options.q) {
    params.push(`%${escapeLikePattern(options.q)}%`);
    // Same bound parameter reused for both columns; ESCAPE '\' makes \% \_ \\
    // match literally. In this TS source '\\\\' produces SQL text '\\'.
    conditions.push(
      `(name ILIKE $${params.length} ESCAPE '\\\\' OR email ILIKE $${params.length} ESCAPE '\\\\')`,
    );
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users ${where}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (page - 1) * limit;
  const dataResult = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ${where} ` +
      `ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return { data: dataResult.rows.map(mapUser), total, page, limit };
}

export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const result = await query<UserRow>(
    `INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
    [input.name, input.email, input.role],
  );
  return mapUser(result.rows[0] as UserRow);
}

export async function getUserById(id: string): Promise<UserWithProfileDto | null> {
  const result = await query<UserRow & Record<string, unknown>>(
    `SELECT u.id, u.name, u.email, u.role, u.created_at, u.updated_at, ${PROFILE_SELECT} ` +
      `FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id ` +
      `WHERE u.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapUser(row), profile: mapJoinedProfile(row) };
}

/** PUT semantics: full replace of name, email and role. */
export async function updateUser(
  id: string,
  input: CreateUserInput,
): Promise<UserDto | null> {
  const result = await query<UserRow>(
    `UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 RETURNING ${USER_COLUMNS}`,
    [input.name, input.email, input.role, id],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

const PATCHABLE_USER_FIELDS = ['name', 'email', 'role'] as const;
export type PatchableUserField = (typeof PATCHABLE_USER_FIELDS)[number];

/** PATCH semantics: dynamic SET built only from an allow-listed field set. */
export async function patchUser(
  id: string,
  input: Partial<Record<PatchableUserField, string>>,
): Promise<UserDto | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of PATCHABLE_USER_FIELDS) {
    const value = input[field];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    const current = await query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    const row = current.rows[0];
    return row ? mapUser(row) : null;
  }
  params.push(id);
  const result = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${USER_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await query('DELETE FROM users WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
