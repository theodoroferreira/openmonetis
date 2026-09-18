ALTER TABLE "pre_lancamentos" ADD COLUMN "pluggy_transaction_id" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "pluggy_account_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "pluggy_status" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "pluggy_flag" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_transaction_type" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_date" date;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_period" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_payment_method" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_category_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_account_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_card_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_installment_count" integer;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_current_installment" integer;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_pluggy_account_id_contas_pluggy_id_fk" FOREIGN KEY ("pluggy_account_id") REFERENCES "public"."contas_pluggy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_parsed_category_id_categorias_id_fk" FOREIGN KEY ("parsed_category_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_parsed_account_id_contas_id_fk" FOREIGN KEY ("parsed_account_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_parsed_card_id_cartoes_id_fk" FOREIGN KEY ("parsed_card_id") REFERENCES "public"."cartoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pre_lancamentos_user_id_pluggy_transaction_id_idx" ON "pre_lancamentos" USING btree ("user_id","pluggy_transaction_id") WHERE pluggy_transaction_id IS NOT NULL;