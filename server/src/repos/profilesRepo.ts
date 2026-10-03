/**
 * User profiles repository (1:1 with users).
 * PUT /users/:id/profile is an upsert: INSERT ... ON CONFLICT DO UPDATE.
 */
import { query } from '../db.js';
import type { ProfileDto } from './usersRepo.js';

export interface UpsertProfileInput {
  bio?: string | null;
  country?: string | null;
  age?: number | null;
}

const PROFILE_COLUMNS = 'user_id, bio, country, age, updated_at';

interface ProfileRow {
  user_id: string;
  bio: string | null;
  country: string | null;
  age: number | null;
  updated_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapProfile(row: ProfileRow): ProfileDto {
  return {
    userId: row.user_id,
    bio: row.bio ?? null,
    country: row.country ?? null,
    age: row.age ?? null,
    updatedAt: toIso(row.updated_at),
  };
}

export async function getProfileByUserId(userId: string): Promise<ProfileDto | null> {
  const result = await query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM user_profiles WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? mapProfile(row) : null;
}

export async function upsertProfile(
  userId: string,
  input: UpsertProfileInput,
): Promise<ProfileDto> {
  const result = await query<ProfileRow>(
    `INSERT INTO user_profiles (user_id, bio, country, age) ` +
      `VALUES ($1, $2, $3, $4) ` +
      `ON CONFLICT (user_id) DO UPDATE SET ` +
      `bio = EXCLUDED.bio, country = EXCLUDED.country, age = EXCLUDED.age ` +
      `RETURNING ${PROFILE_COLUMNS}`,
    [userId, input.bio ?? null, input.country ?? null, input.age ?? null],
  );
  return mapProfile(result.rows[0] as ProfileRow);
}
