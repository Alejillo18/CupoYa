import { z } from 'zod';

export const changeRoleSchema = z.object({
  role: z.enum(['USUARIO', 'OPERADOR', 'ADMIN']),
});

export const usersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});