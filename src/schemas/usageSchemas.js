import * as z from "zod";

// Query string for the paginated call log.
//
// `before` stays a string all the way through. api_usage_id is an int8, which can
// outgrow Number.MAX_SAFE_INTEGER -- turning the cursor into a JS number would
// quietly round it and start skipping or repeating rows.
export const usageLogQuerySchema = z
  .object({
    before: z
      .string()
      .regex(/^\d+$/, 'Cursor must be a positive whole number')
      .optional(),

    limit: z.coerce
      .number()
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit must be at most 100')
      .default(25), // matches PAGE_SIZE in public/js/usage.js
  })
  .strict(); // reject unexpected keys instead of silently stripping them
