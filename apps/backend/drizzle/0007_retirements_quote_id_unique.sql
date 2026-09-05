ALTER TABLE "retirements" ALTER COLUMN "quote_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "retirements" ADD CONSTRAINT "retirements_quote_id_unique" UNIQUE("quote_id");