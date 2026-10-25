import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  venue: z.string().trim().min(1).max(160),
  startsAt: z.coerce.date(),
  totalCapacity: z.number().int().min(1).max(1_000_000),
});

export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000),
    venue: z.string().trim().min(1).max(160),
    startsAt: z.coerce.date(),
    totalCapacity: z.number().int().min(1).max(1_000_000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Enviá al menos un campo para modificar.',
  });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});