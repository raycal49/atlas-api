import * as z from "zod";

const blankable = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const usageLogQuerySchema = z
  .object({
    api: blankable(z.uuid('API must be a valid id')),

    from: blankable(z.iso.datetime('From must be an ISO datetime')),
    to: blankable(z.iso.datetime('To must be an ISO datetime')),

    cursor_at: blankable(z.iso.datetime('Cursor time must be an ISO datetime')),
    cursor_id: blankable(z.string().regex(/^\d+$/, 'Cursor id must be digits')),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    message: 'From date must be before the to date',
    path: ['from'],
  })
  .refine((query) => Boolean(query.cursor_at) === Boolean(query.cursor_id), {
    message: 'Cursor time and cursor id must be sent together',
    path: ['cursor_at'],
  });
