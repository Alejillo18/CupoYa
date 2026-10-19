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
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});
export const googleSchema = z.object({
  idToken: z.string().min(1).max(4096),
});

export type LoginInput = z.infer<typeof loginSchema>;