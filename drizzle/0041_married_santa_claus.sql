CREATE TABLE "mcp_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_id" uuid,
	"tool" text NOT NULL,
	"arguments" jsonb,
	"result" text NOT NULL,
	"message" text,
	"affected_ids" jsonb,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens_api" ADD COLUMN "scope" text DEFAULT 'companion' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_audit_log" ADD CONSTRAINT "mcp_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit_log" ADD CONSTRAINT "mcp_audit_log_token_id_tokens_api_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens_api"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_audit_log_user_id_created_at_idx" ON "mcp_audit_log" USING btree ("user_id","created_at");