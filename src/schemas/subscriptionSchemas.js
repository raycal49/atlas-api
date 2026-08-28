import * as z from 'zod';

export const selectPlanSchema = z
  .object({
    plan_name: z
      .string()
      .trim()
      .min(1, 'Plan name is required')
      .max(50, 'Plan name is too long'),

    card_number: z
      .string()
      .trim()
      .regex(/^\d{13,19}$/, 'Card number must be 13-19 digits')
      .transform((n) => n.slice(-4))
      .optional(),
  })
  .strict();
