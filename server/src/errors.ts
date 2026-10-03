/**
 * Application errors and the SQLSTATE -> HTTP mapping.
 *
 * The database is the final source of truth: constraint violations raised by
 * Postgres are translated here into the correct RFC 9457 problem+json status.
 * Details are humanized — SQL text, constraint internals and stack traces are
 * never leaked to the client.
 */

export interface ProblemErrorItem {
  field?: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly title: string;
  readonly code: string;
  readonly errors: ProblemErrorItem[];

  constructor(init: {
    status: number;
    title: string;
    code?: string;
    detail?: string;
    errors?: ProblemErrorItem[];
  }) {
    super(init.detail ?? init.title);
    this.name = 'AppError';
    this.status = init.status;
    this.title = init.title;
    this.code = init.code ?? 'ERROR';
    this.errors = init.errors ?? [];
  }
}

export function notFound(resource = 'Resource'): AppError {
  return new AppError({
    status: 404,
    title: 'Not Found',
    code: 'NOT_FOUND',
    detail: `${resource} not found.`,
  });
}

export function conflict(detail: string): AppError {
  return new AppError({ status: 409, title: 'Conflict', code: 'CONFLICT', detail });
}

export function unprocessable(
  detail: string,
  errors: ProblemErrorItem[] = [],
): AppError {
  return new AppError({
    status: 422,
    title: 'Unprocessable Entity',
    code: 'UNPROCESSABLE',
    detail,
    errors,
  });
}

export function badRequest(
  detail: string,
  errors: ProblemErrorItem[] = [],
): AppError {
  return new AppError({
    status: 400,
    title: 'Bad Request',
    code: 'BAD_REQUEST',
    detail,
    errors,
  });
}

export function serviceUnavailable(
  detail = 'The database is temporarily unavailable. Please retry shortly.',
): AppError {
  return new AppError({
    status: 503,
    title: 'Service Unavailable',
    code: 'SERVICE_UNAVAILABLE',
    detail,
  });
}

/**
 * Map a pg/database error to an AppError.
 *
 * @param err       the thrown error (pg DatabaseError, Node system error, or a
 *                  coded object like { code: 'SEATS_FULL' } from a repo)
 * @param operation the repo operation in progress ('delete' distinguishes
 *                  23503 raised by ON DELETE RESTRICT from a missing FK target)
 */
export function mapPgError(err: unknown, operation?: string): AppError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined;

  switch (code) {
    case 'SEATS_FULL':
      return conflict('Course is full: no seats remaining.');
    case 'COURSE_NOT_FOUND':
      return notFound('Course');
    case '23505': // unique_violation
      return conflict('Duplicate value: a unique constraint was violated.');
    case '23503': // foreign_key_violation
      return operation === 'delete'
        ? conflict('Cannot delete this record because other records depend on it.')
        : unprocessable('A referenced record does not exist.');
    case '23514': // check_violation
      return unprocessable('A value violates a database check constraint.');
    case '23502': // not_null_violation
      return badRequest('A required value is missing.');
    case '22P02': // invalid_text_representation (e.g. malformed uuid)
      return badRequest('A value has an invalid format (e.g. malformed id).');
    case '22001': // string_data_right_truncation
      return unprocessable('A value exceeds the maximum allowed length.');
    // Transient / connection failures -> 503 so callers can retry.
    case '57P01': // admin_shutdown
    case '57P02': // crash_shutdown
    case '53300': // too_many_connections
    case '58000': // system_error
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
    case 'EAI_AGAIN':
    case 'ECONNRESET':
      return serviceUnavailable();
    default:
      break;
  }

  return new AppError({
    status: 500,
    title: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    detail: 'An unexpected database error occurred.',
  });
}
