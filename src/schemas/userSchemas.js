import * as z from "zod";

export const registerSchema = z
  .object({
    username: z
      .string({ required_error: 'Username is required' })
      .trim()
      .min(5, 'Username must be at least 5 characters')
      .max(15, 'Username must be at most 15 characters')
      .regex(
        /^[a-zA-Z0-9]+$/,
        'Username may only contain letters and numbers'
      ),

    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address')
      .max(30, 'Email is too long'),

    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(15, 'Password must be at most 15 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
  })
  .strict(); 

export const loginSchema = z
  .object({
    username: z
      .string({ required_error: 'Username is required' })
      .trim()
      .min(1, 'Username is required')
      .max(15, 'Username must be at most 15 characters'),

    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
      .max(15, 'Password must be at most 15 characters'),
  })
  .strict();
