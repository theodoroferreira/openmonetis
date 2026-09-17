CREATE TABLE "itens_pluggy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pluggy_item_id" text NOT NULL,
	"connector_id" integer,
	"connector_name" text,
	"status" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_transaction_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "itens_pluggy" ADD CONSTRAINT "itens_pluggy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "itens_pluggy_user_id_pluggy_item_id_idx" ON "itens_pluggy" USING btree ("user_id","pluggy_item_id");--> statement-breakpoint
CREATE INDEX "itens_pluggy_pluggy_item_id_idx" ON "itens_pluggy" USING btree ("pluggy_item_id");