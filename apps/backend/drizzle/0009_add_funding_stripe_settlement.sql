ALTER TABLE "ledger_entries" ADD COLUMN "stripe_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "stripe_net_cents" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "stripe_exchange_rate" numeric;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "stripe_balance_transaction_id" text;