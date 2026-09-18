ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_moeda_origem" text;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_valor_origem" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_taxa_cambio" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_cotacao_fonte" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "moeda_origem" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "valor_origem" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "taxa_cambio" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "cotacao_fonte" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "cotacao_data" date;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_moeda_origem_completo" CHECK (
  (moeda_origem IS NULL AND valor_origem IS NULL AND taxa_cambio IS NULL
   AND cotacao_fonte IS NULL AND cotacao_data IS NULL)
  OR
  (moeda_origem IS NOT NULL AND valor_origem IS NOT NULL AND taxa_cambio IS NOT NULL
   AND cotacao_fonte IS NOT NULL AND cotacao_data IS NOT NULL)
);