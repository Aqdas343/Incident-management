import { z } from 'zod';

const passwordComplexity = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+/;


export const UserCreateSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(passwordComplexity, {
      message: 'Password must include uppercase, lowercase, number, and special character',
    }),
  role: z.enum(['incident_manager', 'support_engineer']),
});

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
