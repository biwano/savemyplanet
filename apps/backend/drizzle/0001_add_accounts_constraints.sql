ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_retirement_id_retirements_id_fk" FOREIGN KEY ("retirement_id") REFERENCES "public"."retirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_unique" UNIQUE("user_id");
