import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError, mapPgError } from '../errors.js';

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: unknown;
  errors: { field?: string; message: string; code?: string }[];
}

/**
 * Humanized messages for database constraint violations. The database is the
 * final source of truth — when it rejects a write, the client gets a plain
 * sentence naming the rule, never SQL text, constraint internals or a stack.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // UNIQUE
  users_email_unique: 'This email is already registered.',
  courses_instructor_title_unique: 'This instructor already has a course with this title.',
  enrollments_pkey: 'This learner is already enrolled in this course.',
  // NOT NULL is caught by Zod first; these are the DB backstop.
  // CHECK
  users_name_check: 'Name must be between 2 and 60 characters.',
  users_role_check: "Role must be either 'learner' or 'instructor'.",
  user_profiles_bio_check: 'Bio must be 300 characters or fewer.',
  user_profiles_age_check: 'Age must be between 16 and 100.',
  courses_title_check: 'Title must be between 3 and 80 characters.',
  courses_level_check: "Level must be 'beginner', 'intermediate' or 'advanced'.",
  courses_seats_check: 'Seats must be between 1 and 500.',
  enrollments_status_check: "Status must be 'active', 'completed' or 'dropped'.",
  // FOREIGN KEY
  enrollments_user_id_fkey: 'This learner does not exist.',
  enrollments_course_id_fkey: 'This course does not exist.',
  user_profiles_user_id_fkey: 'This user does not exist.',
  courses_instructor_id_fkey: 'This instructor does not exist.',
};

function humanizedDetail(err: unknown, operation: string | undefined): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  const constraint = typeof e.constraint === 'string' ? e.constraint : undefined;
  if (constraint && CONSTRAINT_MESSAGES[constraint]) {
    // Deleting an instructor with courses hits the RESTRICT FK: say why.
    if (constraint === 'courses_instructor_id_fkey' && operation === 'delete') {
      return 'Cannot delete this instructor: they still teach one or more courses.';
    }
    return CONSTRAINT_MESSAGES[constraint];
  }
  // The ensure_instructor_role() trigger raises 23514 with a business message
  // (no SQL internals) — surface it directly.
  if (
    e.code === '23514' &&
    typeof e.message === 'string' &&
    e.message.includes('instructor')
  ) {
    return 'The instructor must be an existing user with the instructor role.';
  }
  return undefined;
}

function isCodedError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

/**
 * Final error middleware. Every failure becomes RFC 9457
 * application/problem+json: { type, title, status, detail, instance,
 * requestId, errors[] }. SQL text, stack traces and credentials never leave
 * the server.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? res.getHeader('X-Request-Id');
  const instance = req.originalUrl;
  let problem: ProblemBody;

  if (err instanceof z.ZodError) {
    // Syntactic validation -> 400. (Business-rule violations surface as 422
    // from the database via mapPgError below.)
    problem = {
      type: 'https://coursevault.dev/problems/validation-error',
      title: 'Bad Request',
      status: 400,
      detail: 'Request validation failed. See errors for details.',
      instance,
      requestId,
      errors: err.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join('.') : undefined,
        message: issue.message,
        code: issue.code,
      })),
    };
  } else if (err instanceof AppError) {
    problem = {
      type: `https://coursevault.dev/problems/${err.code.toLowerCase().replace(/_/g, '-')}`,
      title: err.title,
      status: err.status,
      detail: err.message,
      instance,
      requestId,
      errors: err.errors,
    };
  } else if (isCodedError(err)) {
    // pg DatabaseError, Node system error, or a repo-coded object
    // ({ code: 'SEATS_FULL' } / { code: 'COURSE_NOT_FOUND' }).
    const operation =
      typeof res.locals.pgOperation === 'string' ? res.locals.pgOperation : undefined;
    const mapped = mapPgError(err, operation);
    const friendly = humanizedDetail(err, operation);
    problem = {
      type: `https://coursevault.dev/problems/${mapped.code.toLowerCase().replace(/_/g, '-')}`,
      title: mapped.title,
      status: mapped.status,
      detail: friendly ?? mapped.message,
      instance,
      requestId,
      errors: mapped.errors,
    };
  } else if (err instanceof SyntaxError && (err as { status?: number }).status === 400) {
    // express.json() could not parse the body.
    problem = {
      type: 'https://coursevault.dev/problems/invalid-json',
      title: 'Bad Request',
      status: 400,
      detail: 'The request body is not valid JSON.',
      instance,
      requestId,
      errors: [],
    };
  } else if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { status?: unknown }).status === 'number'
  ) {
    // Errors that already carry an HTTP status (e.g. 413 entity.too.large).
    const status = (err as { status: number }).status;
    problem = {
      type: 'https://coursevault.dev/problems/http-error',
      title: status === 413 ? 'Payload Too Large' : 'Request Error',
      status,
      detail: (err as Error).message || 'The request could not be processed.',
      instance,
      requestId,
      errors: [],
    };
  } else {
    problem = {
      type: 'https://coursevault.dev/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance,
      requestId,
      errors: [],
    };
  }

  if (problem.status === 429 || problem.status === 503) {
    res.set('Retry-After', '30');
  }
  res.status(problem.status).type('application/problem+json').json(problem);
}
