CREATE TABLE "contas_pluggy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"pluggy_account_id" text NOT NULL,
	"tipo" text NOT NULL,
	"subtipo" text,
	"nome" text NOT NULL,
	"numero" text,
	"moeda" text,
	"saldo" numeric(12, 2),
	"saldo_atualizado_em" timestamp with time zone,
	"limite" numeric(12, 2),
	"limite_disponivel" numeric(12, 2),
	"dt_fechamento" text,
	"dt_vencimento" text,
	"bandeira" text,
	"status_vinculo" text DEFAULT 'pendente' NOT NULL,
	"conta_id" uuid,
	"cartao_id" uuid,
	"last_transaction_cursor" text,
	"last_synced_at" timestamp with time zone,
	"syncing_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_pluggy_vinculo_check" CHECK (("status_vinculo" = 'vinculada' AND (("tipo" = 'BANK' AND "conta_id" IS NOT NULL AND "cartao_id" IS NULL) OR ("tipo" = 'CREDIT' AND "cartao_id" IS NOT NULL AND "conta_id" IS NULL))) OR ("status_vinculo" != 'vinculada' AND "conta_id" IS NULL AND "cartao_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "contas_pluggy" ADD CONSTRAINT "contas_pluggy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_pluggy" ADD CONSTRAINT "contas_pluggy_item_id_itens_pluggy_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."itens_pluggy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_pluggy" ADD CONSTRAINT "contas_pluggy_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_pluggy" ADD CONSTRAINT "contas_pluggy_cartao_id_cartoes_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contas_pluggy_pluggy_account_id_idx" ON "contas_pluggy" USING btree ("pluggy_account_id");--> statement-breakpoint
CREATE INDEX "contas_pluggy_user_id_item_id_idx" ON "contas_pluggy" USING btree ("user_id","item_id");--> statement-breakpoint
ALTER TABLE "itens_pluggy" DROP COLUMN "last_transaction_cursor";