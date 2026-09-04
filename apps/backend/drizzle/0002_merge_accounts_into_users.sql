ALTER TABLE "users" ADD COLUMN "available_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reserved_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "users" AS u
SET
	"available_cents" = a."available_cents",
	"reserved_cents" = a."reserved_cents"
FROM "accounts" AS a
WHERE a."user_id" = u."id";--> statement-breakpoint
DROP TABLE "accounts";
