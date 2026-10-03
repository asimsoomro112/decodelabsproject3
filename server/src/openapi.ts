import { z } from 'zod';
import {
  userCreateSchema,
  userPatchSchema,
  profileUpsertSchema,
  courseCreateSchema,
  coursePatchSchema,
  enrollmentCreateSchema,
  injectionInputSchema,
} from './validation/schemas.js';

/**
 * OpenAPI 3.1 document served at GET /openapi.json and rendered by Scalar at
 * /reference. Request/response shapes are generated from the Zod schemas with
 * z.toJSONSchema() so the docs can never drift from validation.
 */

type Json = Record<string, unknown>;

const js = (schema: z.ZodType): Json => z.toJSONSchema(schema) as unknown as Json;
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

// --- response DTOs (mirror the repository DTOs) -------------------------------

const User = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['learner', 'instructor']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const Profile = z.object({
  userId: z.uuid(),
  bio: z.string().nullable(),
  country: z.string().nullable(),
  age: z.number().nullable(),
  updatedAt: z.string(),
});

const UserWithProfile = User.extend({ profile: Profile.nullable() });

const Course = z.object({
  id: z.uuid(),
  instructorId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  seats: z.number(),
  startDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CourseDetail = Course.extend({
  instructor: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  enrolledCount: z.number(),
});

const Enrollment = z.object({
  userId: z.uuid(),
  courseId: z.uuid(),
  status: z.enum(['active', 'completed', 'dropped']),
  enrolledAt: z.string(),
});

const EnrollmentWithUser = Enrollment.extend({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string(), role: z.string() }),
});

const EnrollmentWithCourse = Enrollment.extend({
  course: z.object({
    id: z.uuid(),
    title: z.string(),
    level: z.string(),
    seats: z.number(),
    startDate: z.string(),
  }),
});

const Stats = z.object({
  totals: z.object({
    users: z.number(),
    instructors: z.number(),
    learners: z.number(),
    courses: z.number(),
    enrollments: z.number(),
    activeEnrollments: z.number(),
  }),
  coursesPerLevel: z.array(z.object({ level: z.string(), count: z.number() })),
  fillRate: z.object({
    totalSeats: z.number(),
    activeEnrollments: z.number(),
    fillRatePct: z.number(),
  }),
  topCourses: z.array(
    z.object({ id: z.uuid(), title: z.string(), level: z.string(), enrolledCount: z.number() }),
  ),
});

const DbColumn = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  default: z.string().nullable(),
  isPrimaryKey: z.boolean(),
});

const DbTable = z.object({
  name: z.string(),
  columns: z.array(DbColumn),
  primaryKey: z.array(z.string()),
  foreignKeys: z.array(
    z.object({
      name: z.string(),
      columns: z.array(z.string()),
      refTable: z.string(),
      refColumns: z.array(z.string()),
      onDelete: z.string(),
    }),
  ),
  uniques: z.array(z.object({ name: z.string(), columns: z.array(z.string()) })),
  checks: z.array(z.object({ name: z.string(), definition: z.string() })),
  indexes: z.array(
    z.object({ name: z.string(), columns: z.array(z.string()), unique: z.boolean() }),
  ),
});

const DbSchema = z.object({ tables: z.array(DbTable) });

const InjectionDemo = z.object({
  naiveQueryWouldBe: z.string(),
  parameterizedQuery: z.string(),
  params: z.array(z.string()),
  executed: z.literal('parameterized'),
  rowsReturned: z.number(),
  rows: z.array(
    z.object({ id: z.uuid(), name: z.string(), email: z.string(), role: z.string() }),
  ),
});

const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string(),
  requestId: z.string().nullable(),
  errors: z.array(
    z.object({
      field: z.string().optional(),
      message: z.string(),
      code: z.string().optional(),
    }),
  ),
});

const QueryEntry = z.object({
  sql: z.string(),
  params: z.array(z.unknown()),
  durationMs: z.number(),
});

// --- envelope helpers -----------------------------------------------------------

/** { data, meta: { page, limit, total, totalPages } } — the list shape. */
function paginated(item: string): Json {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: ref(item) },
      meta: {
        type: 'object',
        required: ['page', 'limit', 'total', 'totalPages'],
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
          queries: {
            type: 'array',
            items: ref('QueryEntry'),
            description:
              'Present only when ?inspect=1 is passed and the SQL inspector is enabled (DEMO_SQL_INSPECTOR=true, non-production).',
          },
        },
      },
    },
  };
}

/** { data } — the single-resource shape. */
function enveloped(item: string): Json {
  return {
    type: 'object',
    required: ['data'],
    properties: {
      data: ref(item),
      meta: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: ref('QueryEntry'),
            description: 'Present only when ?inspect=1 and the SQL inspector is enabled.',
          },
        },
      },
    },
  };
}

/** { data: [...] } without pagination (nested collections). */
function listed(item: string): Json {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { type: 'array', items: ref(item) } },
  };
}

const problemResponse = (description: string): Json => ({
  description,
  content: { 'application/problem+json': { schema: ref('Problem') } },
});

const idParam = (name = 'id', description = 'UUID'): Json => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const paginationParams: Json[] = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const inspectParam: Json = {
  name: 'inspect',
  in: 'query',
  description: 'Set to 1 to include meta.queries (requires DEMO_SQL_INSPECTOR=true, non-production).',
  schema: { type: 'string', enum: ['1'] },
};

const jsonBody = (schemaName: string, example?: unknown): Json => {
  const body: Json = {
    required: true,
    content: { 'application/json': { schema: ref(schemaName) } },
  };
  if (example !== undefined) {
    ((body.content as Json)['application/json'] as Json).example = example;
  }
  return body;
};

// --- paths ----------------------------------------------------------------------

const paths: Json = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Liveness probe',
      responses: {
        '200': {
          description: 'The process is up.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  version: { type: 'string' },
                  uptime: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/ready': {
    get: {
      tags: ['System'],
      summary: 'Readiness probe (runs SELECT 1)',
      responses: {
        '200': { description: 'Database is reachable.' },
        '503': problemResponse('Database is not reachable.'),
      },
    },
  },
  '/users': {
    get: {
      tags: ['Users'],
      summary: 'List users (POST = INSERT)',
      parameters: [
        ...paginationParams,
        { name: 'role', in: 'query', schema: { type: 'string', enum: ['learner', 'instructor'] } },
        { name: 'q', in: 'query', description: 'Free-text search over name and email (ILIKE, wildcard-escaped, parameterized).', schema: { type: 'string', maxLength: 100 } },
        inspectParam,
      ],
      responses: {
        '200': { description: 'Paginated users.', content: { 'application/json': { schema: paginated('User') } } },
        '400': problemResponse('Invalid query parameters.'),
      },
    },
    post: {
      tags: ['Users'],
      summary: 'Create a user (HTTP POST -> SQL INSERT)',
      requestBody: jsonBody('UserCreate', { name: 'Sara Ahmed', email: 'sara@example.com', role: 'instructor' }),
      responses: {
        '201': {
          description: 'Created. Location header points at the new resource.',
          headers: { Location: { description: 'URL of the created user.', schema: { type: 'string' } } },
          content: { 'application/json': { schema: enveloped('User') } },
        },
        '400': problemResponse('Validation failed (Zod).'),
        '409': problemResponse('Email already registered (UNIQUE).'),
      },
    },
  },
  '/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Get a user with profile (HTTP GET -> SQL SELECT)',
      parameters: [idParam(), inspectParam],
      responses: {
        '200': { description: 'User with embedded profile.', content: { 'application/json': { schema: enveloped('UserWithProfile') } } },
        '400': problemResponse('Malformed UUID.'),
        '404': problemResponse('User not found.'),
      },
    },
    put: {
      tags: ['Users'],
      summary: 'Replace a user (HTTP PUT -> SQL UPDATE)',
      parameters: [idParam()],
      requestBody: jsonBody('UserCreate'),
      responses: {
        '200': { description: 'Replaced.', content: { 'application/json': { schema: enveloped('User') } } },
        '400': problemResponse('Validation failed.'),
        '404': problemResponse('User not found.'),
        '409': problemResponse('Email already registered (UNIQUE).'),
      },
    },
    patch: {
      tags: ['Users'],
      summary: 'Update a user partially (HTTP PATCH -> SQL UPDATE)',
      parameters: [idParam()],
      requestBody: jsonBody('UserPatch'),
      responses: {
        '200': { description: 'Updated.', content: { 'application/json': { schema: enveloped('User') } } },
        '400': problemResponse('Validation failed or empty patch.'),
        '404': problemResponse('User not found.'),
        '409': problemResponse('Email already registered (UNIQUE).'),
      },
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete a user (HTTP DELETE -> SQL DELETE)',
      parameters: [idParam()],
      responses: {
        '204': { description: 'Deleted. Enrollments cascade; instructors with courses are protected (409).' },
        '400': problemResponse('Malformed UUID.'),
        '404': problemResponse('User not found.'),
        '409': problemResponse('Instructor still teaches courses (ON DELETE RESTRICT).'),
      },
    },
  },
  '/users/{id}/profile': {
    get: {
      tags: ['Users'],
      summary: 'Get a user profile (1:1 relation)',
      parameters: [idParam()],
      responses: {
        '200': { description: 'Profile.', content: { 'application/json': { schema: enveloped('Profile') } } },
        '404': problemResponse('User or profile not found.'),
      },
    },
    put: {
      tags: ['Users'],
      summary: 'Upsert a user profile (INSERT ... ON CONFLICT DO UPDATE)',
      parameters: [idParam()],
      requestBody: jsonBody('ProfileUpsert', { bio: 'Backend engineer.', country: 'Pakistan', age: 24 }),
      responses: {
        '200': { description: 'Upserted.', content: { 'application/json': { schema: enveloped('Profile') } } },
        '400': problemResponse('Validation failed.'),
        '404': problemResponse('User not found.'),
        '422': problemResponse('Database CHECK rejected the value (e.g. age outside 16..100).'),
      },
    },
  },
  '/users/{id}/enrollments': {
    get: {
      tags: ['Enrollments'],
      summary: "List a learner's enrollments with their courses",
      parameters: [idParam(), inspectParam],
      responses: {
        '200': { description: 'Enrollments.', content: { 'application/json': { schema: listed('EnrollmentWithCourse') } } },
        '404': problemResponse('User not found.'),
      },
    },
  },
  '/courses': {
    get: {
      tags: ['Courses'],
      summary: 'List courses',
      parameters: [
        ...paginationParams,
        { name: 'level', in: 'query', schema: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] } },
        { name: 'instructorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'q', in: 'query', description: 'Free-text search over title and description.', schema: { type: 'string', maxLength: 100 } },
        inspectParam,
      ],
      responses: {
        '200': { description: 'Paginated courses.', content: { 'application/json': { schema: paginated('Course') } } },
        '400': problemResponse('Invalid query parameters.'),
      },
    },
    post: {
      tags: ['Courses'],
      summary: 'Create a course',
      requestBody: jsonBody('CourseCreate', {
        instructorId: '00000000-0000-0000-0000-000000000000',
        title: 'PostgreSQL Fundamentals',
        level: 'beginner',
        seats: 40,
        startDate: '2026-11-10',
      }),
      responses: {
        '201': {
          description: 'Created.',
          headers: { Location: { schema: { type: 'string' } } },
          content: { 'application/json': { schema: enveloped('Course') } },
        },
        '400': problemResponse('Validation failed.'),
        '409': problemResponse('Duplicate (instructor_id, title).'),
        '422': problemResponse('Instructor must be a user with the instructor role, or a referenced row is missing.'),
      },
    },
  },
  '/courses/{id}': {
    get: {
      tags: ['Courses'],
      summary: 'Get a course with instructor and enrolledCount',
      parameters: [idParam(), inspectParam],
      responses: {
        '200': { description: 'Course detail.', content: { 'application/json': { schema: enveloped('CourseDetail') } } },
        '400': problemResponse('Malformed UUID.'),
        '404': problemResponse('Course not found.'),
      },
    },
    put: {
      tags: ['Courses'],
      summary: 'Replace a course',
      parameters: [idParam()],
      requestBody: jsonBody('CourseCreate'),
      responses: {
        '200': { description: 'Replaced.', content: { 'application/json': { schema: enveloped('Course') } } },
        '400': problemResponse('Validation failed.'),
        '404': problemResponse('Course not found.'),
        '409': problemResponse('Duplicate (instructor_id, title).'),
        '422': problemResponse('Check or instructor-role violation.'),
      },
    },
    patch: {
      tags: ['Courses'],
      summary: 'Update a course partially',
      parameters: [idParam()],
      requestBody: jsonBody('CoursePatch'),
      responses: {
        '200': { description: 'Updated.', content: { 'application/json': { schema: enveloped('Course') } } },
        '400': problemResponse('Validation failed or empty patch.'),
        '404': problemResponse('Course not found.'),
        '409': problemResponse('Duplicate (instructor_id, title).'),
        '422': problemResponse('Check or instructor-role violation.'),
      },
    },
    delete: {
      tags: ['Courses'],
      summary: 'Delete a course (enrollments cascade)',
      parameters: [idParam()],
      responses: {
        '204': { description: 'Deleted.' },
        '404': problemResponse('Course not found.'),
      },
    },
  },
  '/courses/{id}/enrollments': {
    get: {
      tags: ['Enrollments'],
      summary: 'List a course roster with learner details',
      parameters: [idParam('id', 'Course UUID'), inspectParam],
      responses: {
        '200': { description: 'Roster.', content: { 'application/json': { schema: listed('EnrollmentWithUser') } } },
        '404': problemResponse('Course not found.'),
      },
    },
    post: {
      tags: ['Enrollments'],
      summary: 'Enroll a learner (transactional, SELECT ... FOR UPDATE)',
      parameters: [idParam('id', 'Course UUID')],
      requestBody: jsonBody('EnrollmentCreate', { userId: '00000000-0000-0000-0000-000000000000' }),
      responses: {
        '201': {
          description: 'Enrolled.',
          headers: { Location: { schema: { type: 'string' } } },
          content: { 'application/json': { schema: enveloped('Enrollment') } },
        },
        '400': problemResponse('Validation failed.'),
        '404': problemResponse('Course not found.'),
        '409': problemResponse('Course is full, or the learner is already enrolled.'),
        '422': problemResponse('Learner does not exist.'),
      },
    },
  },
  '/courses/{id}/enrollments/{userId}': {
    delete: {
      tags: ['Enrollments'],
      summary: 'Remove an enrollment',
      parameters: [idParam('id', 'Course UUID'), idParam('userId', 'Learner UUID')],
      responses: {
        '204': { description: 'Removed.' },
        '404': problemResponse('Course or enrollment not found.'),
      },
    },
  },
  '/stats': {
    get: {
      tags: ['Stats'],
      summary: 'Dashboard aggregates (JOIN + GROUP BY)',
      parameters: [inspectParam],
      responses: {
        '200': { description: 'Aggregates.', content: { 'application/json': { schema: enveloped('Stats') } } },
        '503': problemResponse('Database unavailable.'),
      },
    },
  },
  '/schema': {
    get: {
      tags: ['Schema'],
      summary: 'Read-only schema introspection for the ER diagram',
      parameters: [inspectParam],
      responses: {
        '200': { description: 'Tables, columns, keys and indexes.', content: { 'application/json': { schema: enveloped('DbSchema') } } },
      },
    },
  },
  '/lab/injection-demo': {
    post: {
      tags: ['Lab'],
      summary: 'SQL injection demo: naive (display only) vs parameterized (executed)',
      requestBody: jsonBody('InjectionInput', { input: "' OR '1'='1" }),
      responses: {
        '200': {
          description: 'Comparison result. The naive query is NEVER executed.',
          content: { 'application/json': { schema: ref('InjectionDemo') } },
        },
        '400': problemResponse('Validation failed.'),
      },
    },
  },
};

export const openapiDoc = {
  openapi: '3.1.0',
  info: {
    title: 'CourseVault API',
    version: '1.0.0',
    description:
      'DecodeLabs Industrial Training Kit (Batch 2026), Project 3: Database Integration.\n\n' +
      'CRUD <-> HTTP <-> SQL mapping: POST -> INSERT, GET -> SELECT, PUT/PATCH -> UPDATE, DELETE -> DELETE.\n\n' +
      'Validation happens twice: Zod at the API (syntactic -> 400) and Postgres constraints ' +
      '(business rules -> 422/409). The database is the final source of truth. Every query is ' +
      'parameterized ($1, $2, ...); input is never concatenated into SQL.\n\n' +
      'All failures are RFC 9457 application/problem+json. Pass ?inspect=1 (with ' +
      'DEMO_SQL_INSPECTOR=true, non-production) to see the exact SQL behind any GET as meta.queries.',
  },
  servers: [{ url: 'http://localhost:4000/api/v1', description: 'Local development' }],
  tags: [
    { name: 'Users' },
    { name: 'Courses' },
    { name: 'Enrollments' },
    { name: 'Stats' },
    { name: 'Schema' },
    { name: 'Lab' },
    { name: 'System' },
  ],
  paths,
  components: {
    schemas: {
      User: js(User),
      UserWithProfile: js(UserWithProfile),
      Profile: js(Profile),
      Course: js(Course),
      CourseDetail: js(CourseDetail),
      Enrollment: js(Enrollment),
      EnrollmentWithUser: js(EnrollmentWithUser),
      EnrollmentWithCourse: js(EnrollmentWithCourse),
      Stats: js(Stats),
      DbSchema: js(DbSchema),
      InjectionDemo: js(InjectionDemo),
      Problem: js(Problem),
      QueryEntry: js(QueryEntry),
      UserCreate: js(userCreateSchema),
      UserPatch: js(userPatchSchema),
      ProfileUpsert: js(profileUpsertSchema),
      CourseCreate: js(courseCreateSchema),
      CoursePatch: js(coursePatchSchema),
      EnrollmentCreate: js(enrollmentCreateSchema),
      InjectionInput: js(injectionInputSchema),
    },
  },
};
