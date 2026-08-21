import * as z from "zod";

const blankable = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const usageLogQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int('Page must be a whole number')
      .min(1, 'Page must be at least 1')
      .default(1),

    limit: z.coerce
      .number()
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must be at most 100')
      .default(25),

    api: blankable(z.uuid('API must be a valid id')),

    from: blankable(z.iso.date('From must be a date (YYYY-MM-DD)')),
    to: blankable(z.iso.date('To must be a date (YYYY-MM-DD)')),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'From date must be on or before the to date',
    path: ['from'],
  });
