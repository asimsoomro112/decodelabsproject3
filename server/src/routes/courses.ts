import { Router } from 'express';
import {
  courseCreateSchema,
  coursePatchSchema,
  courseListQuerySchema,
  enrollmentCreateSchema,
  idParamSchema,
  enrollmentPathParamSchema,
} from '../validation/schemas.js';
import * as coursesRepo from '../repos/coursesRepo.js';
import * as enrollmentsRepo from '../repos/enrollmentsRepo.js';
import { notFound, badRequest } from '../errors.js';

export const coursesRouter = Router();

// GET /api/v1/courses?level=&q=&instructorId=&page=&limit=
coursesRouter.get('/', async (req, res) => {
  const q = courseListQuerySchema.parse(req.query);
  const { data, total, page, limit } = await coursesRepo.listCourses(q);
  res.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// POST /api/v1/courses -> 201 + Location
// A learner as instructorId is rejected by the DB trigger -> 422.
coursesRouter.post('/', async (req, res) => {
  const input = courseCreateSchema.parse(req.body);
  const course = await coursesRepo.createCourse(input);
  res.status(201).location(`/api/v1/courses/${course.id}`).json({ data: course });
});

// GET /api/v1/courses/:id — with instructor and enrolledCount
coursesRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const course = await coursesRepo.getCourseById(id);
  if (!course) throw notFound('Course');
  res.json({ data: course });
});

// PUT /api/v1/courses/:id — full replace
coursesRouter.put('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = courseCreateSchema.parse(req.body);
  const course = await coursesRepo.updateCourse(id, input);
  if (!course) throw notFound('Course');
  res.json({ data: course });
});

// PATCH /api/v1/courses/:id — partial update
coursesRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = coursePatchSchema.parse(req.body);
  if (Object.keys(input).length === 0) {
    throw badRequest('Provide at least one field to update.');
  }
  const course = await coursesRepo.patchCourse(id, input);
  if (!course) throw notFound('Course');
  res.json({ data: course });
});

// DELETE /api/v1/courses/:id -> 204 (enrollments cascade)
coursesRouter.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.locals.pgOperation = 'delete';
  const deleted = await coursesRepo.deleteCourse(id);
  if (!deleted) throw notFound('Course');
  res.status(204).end();
});

// GET /api/v1/courses/:id/enrollments — roster with learner details
coursesRouter.get('/:id/enrollments', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const course = await coursesRepo.getCourseById(id);
  if (!course) throw notFound('Course');
  const data = await enrollmentsRepo.listEnrollmentsByCourse(id);
  res.json({ data, meta: { total: data.length } });
});

// POST /api/v1/courses/:id/enrollments { userId } -> 201 + Location
// Runs in ONE transaction (SELECT ... FOR UPDATE): full course -> 409,
// unknown course -> 404, unknown user -> 422, duplicate -> 409.
coursesRouter.post('/:id/enrollments', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { userId } = enrollmentCreateSchema.parse(req.body);
  const enrollment = await enrollmentsRepo.createEnrollment(id, userId);
  res
    .status(201)
    .location(`/api/v1/courses/${id}/enrollments/${userId}`)
    .json({ data: enrollment });
});

// DELETE /api/v1/courses/:id/enrollments/:userId -> 204
coursesRouter.delete('/:id/enrollments/:userId', async (req, res) => {
  const { id, userId } = enrollmentPathParamSchema.parse(req.params);
  const deleted = await enrollmentsRepo.deleteEnrollment(id, userId);
  if (!deleted) throw notFound('Enrollment');
  res.status(204).end();
});
