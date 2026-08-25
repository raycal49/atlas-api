ALTER TABLE "public"."subscriptions"
    ADD COLUMN IF NOT EXISTS "pending_plan_id" "uuid";


ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pending_plan_id_fkey" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("plan_id") ON UPDATE NO ACTION ON DELETE SET NULL;
