import { Router } from 'express';
import {
  userCreateSchema,
  userUpdateSchema,
  userPatchSchema,
  profileUpsertSchema,
  userListQuerySchema,
  idParamSchema,
} from '../validation/schemas.js';
import * as usersRepo from '../repos/usersRepo.js';
import * as profilesRepo from '../repos/profilesRepo.js';
import * as enrollmentsRepo from '../repos/enrollmentsRepo.js';
import { notFound, badRequest } from '../errors.js';

export const usersRouter = Router();

// GET /api/v1/users?role=&q=&page=&limit=
usersRouter.get('/', async (req, res) => {
  const q = userListQuerySchema.parse(req.query);
  const { data, total, page, limit } = await usersRepo.listUsers(q);
  res.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// POST /api/v1/users -> 201 + Location
usersRouter.post('/', async (req, res) => {
  const input = userCreateSchema.parse(req.body);
  const user = await usersRepo.createUser(input);
  res.status(201).location(`/api/v1/users/${user.id}`).json({ data: user });
});

// GET /api/v1/users/:id — with profile
usersRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const user = await usersRepo.getUserById(id);
  if (!user) throw notFound('User');
  res.json({ data: user });
});

// PUT /api/v1/users/:id — full replace
usersRouter.put('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = userUpdateSchema.parse(req.body);
  const user = await usersRepo.updateUser(id, input);
  if (!user) throw notFound('User');
  res.json({ data: user });
});

// PATCH /api/v1/users/:id — partial update
usersRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = userPatchSchema.parse(req.body);
  if (Object.keys(input).length === 0) {
    throw badRequest('Provide at least one field to update.');
  }
  const user = await usersRepo.patchUser(id, input);
  if (!user) throw notFound('User');
  res.json({ data: user });
});

// DELETE /api/v1/users/:id -> 204
// pgOperation='delete' so 23503 from ON DELETE RESTRICT maps to 409.
usersRouter.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.locals.pgOperation = 'delete';
  const deleted = await usersRepo.deleteUser(id);
  if (!deleted) throw notFound('User');
  res.status(204).end();
});

// GET /api/v1/users/:id/profile
usersRouter.get('/:id/profile', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const user = await usersRepo.getUserById(id);
  if (!user) throw notFound('User');
  const profile = await profilesRepo.getProfileByUserId(id);
  if (!profile) throw notFound('Profile');
  res.json({ data: profile });
});

// PUT /api/v1/users/:id/profile — upsert -> 200
usersRouter.put('/:id/profile', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = profileUpsertSchema.parse(req.body);
  const user = await usersRepo.getUserById(id);
  if (!user) throw notFound('User');
  const profile = await profilesRepo.upsertProfile(id, input);
  res.json({ data: profile });
});

// GET /api/v1/users/:id/enrollments — enrollments with their course
usersRouter.get('/:id/enrollments', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const user = await usersRepo.getUserById(id);
  if (!user) throw notFound('User');
  const data = await enrollmentsRepo.listEnrollmentsByUser(id);
  res.json({ data, meta: { total: data.length } });
});
