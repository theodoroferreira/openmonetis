CREATE TABLE "cotacoes_cambio" (
	"moeda" text NOT NULL,
	"data" date NOT NULL,
	"taxa" numeric(18, 8) NOT NULL,
	"fonte" text NOT NULL,
	"data_cotacao" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotacoes_cambio_moeda_data_pk" PRIMARY KEY("moeda","data")
);
