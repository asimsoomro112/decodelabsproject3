import { z } from 'zod';

/**
 * Request validation (Zod 4). Two layers by design:
 *  - Syntactic problems (wrong type, missing field, bad format) -> HTTP 400.
 *  - Business rules live in the DATABASE as constraints -> HTTP 422/409.
 * The database is the final source of truth; Zod never duplicates a rule
 * that the Security screen demonstrates live (notably the age CHECK).
 */

export const roleEnum = z.enum(['learner', 'instructor']);
export const levelEnum = z.enum(['beginner', 'intermediate', 'advanced']);

// --- users ---------------------------------------------------------------

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be at most 60 characters.'),
  email: z.string().trim().email('Must be a valid email address.').max(254),
  role: roleEnum,
});

/** PUT /users/:id — full replace, same shape as create. */
export const userUpdateSchema = userCreateSchema;

/** PATCH /users/:id — partial update. */
export const userPatchSchema = userCreateSchema.partial();

// --- profiles --------------------------------------------------------------

export const profileUpsertSchema = z.object({
  bio: z.string().trim().max(300, 'Bio must be at most 300 characters.').nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  // NOTE: the 16..100 range is intentionally NOT validated here. The
  // user_profiles_age_check constraint in Postgres is the final arbiter and
  // surfaces as HTTP 422 — the Security screen's "CHECK" demo depends on it.
  age: z.number().int('Age must be an integer.').nullable().optional(),
});

// --- courses ---------------------------------------------------------------

export const courseCreateSchema = z.object({
  instructorId: z.uuid('instructorId must be a valid UUID.'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(80, 'Title must be at most 80 characters.'),
  description: z.string().trim().max(2000).nullable().optional(),
  level: levelEnum,
  seats: z.number().int().min(1).max(500),
  startDate: z.iso.date('startDate must be YYYY-MM-DD.'),
});

/** PATCH /courses/:id — partial update (instructor may be reassigned; the
 *  DB trigger still enforces the instructor role -> 422). */
export const coursePatchSchema = courseCreateSchema.partial();

// --- enrollments -------------------------------------------------------------

export const enrollmentCreateSchema = z.object({
  userId: z.uuid('userId must be a valid UUID.'),
});

// --- query strings -----------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userListQuerySchema = paginationSchema.extend({
  role: roleEnum.optional(),
  q: z.string().max(100).optional(),
});

export const courseListQuerySchema = paginationSchema.extend({
  level: levelEnum.optional(),
  instructorId: z.uuid().optional(),
  q: z.string().max(100).optional(),
});

// --- path params ---------------------------------------------------------------

export const idParamSchema = z.object({
  id: z.uuid('id must be a valid UUID.'),
});

export const enrollmentPathParamSchema = z.object({
  id: z.uuid('id must be a valid UUID.'),
  userId: z.uuid('userId must be a valid UUID.'),
});

// --- injection lab -------------------------------------------------------------

export const injectionInputSchema = z.object({
  input: z.string().max(200, 'Input must be at most 200 characters.'),
});

// --- inferred types ------------------------------------------------------------

export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
export type UserPatch = z.infer<typeof userPatchSchema>;
export type ProfileUpsert = z.infer<typeof profileUpsertSchema>;
export type CourseCreate = z.infer<typeof courseCreateSchema>;
export type CoursePatch = z.infer<typeof coursePatchSchema>;
export type EnrollmentCreate = z.infer<typeof enrollmentCreateSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
export type InjectionInput = z.infer<typeof injectionInputSchema>;
