import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
});

export type RegisterInput = z.infer<typeof registerSchema>;