ALTER TABLE "evaluations" ADD COLUMN "openrouter_cost_usd" numeric;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "openrouter_model" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "total_tokens" integer;