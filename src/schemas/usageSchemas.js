import * as z from "zod";

// An HTML GET form submits untouched fields as empty strings (?api=&from=),
// so an optional filter has to treat '' as absent. Every filter goes through
// this wrapper, so a future filter column gets that behaviour for free.
const blankable = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

// Query string for the paginated, filterable call log.
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
      .default(25), // matches PAGE_SIZE in public/js/usage.js

    // ---- filters: a future filter column is one more blankable() line ----
    api: blankable(z.uuid('API must be a valid id')), // api_product_id

    // YYYY-MM-DD, exactly what <input type="date"> submits
    from: blankable(z.iso.date('From must be a date (YYYY-MM-DD)')),
    to: blankable(z.iso.date('To must be a date (YYYY-MM-DD)')),
  })
  .strict() // reject unexpected keys instead of silently stripping them
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'From date must be on or before the to date',
    path: ['from'],
  });
