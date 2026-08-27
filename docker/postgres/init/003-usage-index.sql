-- Pagination index for the usage log.
-- Distinct from "api_usage_user_id_idx" in 001-schema.sql, which covers
-- (user_id, api_usage_id DESC); this one covers (user_id, used_at DESC).
CREATE INDEX IF NOT EXISTS "api_usage_user_used_at_idx"
    ON "public"."api_usage" USING "btree" ("user_id", "used_at" DESC);
