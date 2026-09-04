ALTER TABLE "ledger_entries" ADD COLUMN "presentment_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "presentment_currency" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id");