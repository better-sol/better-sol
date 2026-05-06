CREATE TYPE "public"."compile_status" AS ENUM('success', 'failed', 'timeout');--> statement-breakpoint
CREATE TABLE "accounts" (
	"address" text PRIMARY KEY NOT NULL,
	"displayName" text,
	"avatarUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deletedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"accountAddress" text NOT NULL,
	"name" text NOT NULL,
	"keyEncrypted" text NOT NULL,
	"keyPrefix" text NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deletedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "compile_results" (
	"id" text PRIMARY KEY NOT NULL,
	"programId" text NOT NULL,
	"accountAddress" text,
	"apiKeyId" text,
	"version" text NOT NULL,
	"status" "compile_status" NOT NULL,
	"compileTimeMs" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"programId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"identifier" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"windowStart" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_accountAddress_accounts_address_fk" FOREIGN KEY ("accountAddress") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_results" ADD CONSTRAINT "compile_results_programId_programs_programId_fk" FOREIGN KEY ("programId") REFERENCES "public"."programs"("programId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_results" ADD CONSTRAINT "compile_results_accountAddress_accounts_address_fk" FOREIGN KEY ("accountAddress") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_results" ADD CONSTRAINT "compile_results_apiKeyId_api_keys_id_fk" FOREIGN KEY ("apiKeyId") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_last_seen_idx" ON "accounts" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "api_keys_account_idx" ON "api_keys" USING btree ("accountAddress");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("keyPrefix");--> statement-breakpoint
CREATE INDEX "compile_results_program_idx" ON "compile_results" USING btree ("programId");--> statement-breakpoint
CREATE INDEX "compile_results_account_idx" ON "compile_results" USING btree ("accountAddress");--> statement-breakpoint
CREATE INDEX "compile_results_api_key_idx" ON "compile_results" USING btree ("apiKeyId");--> statement-breakpoint
CREATE INDEX "compile_results_created_at_idx" ON "compile_results" USING btree ("createdAt");