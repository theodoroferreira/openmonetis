export const BASE_CURRENCY = "BRL";

export type CurrencyMeta = {
	code: string;
	name: string;
};

/** Moedas suportadas: a cobertura do Frankfurter, que e a fonte mais ampla. */
export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
	{ code: "BRL", name: "Real brasileiro" },
	{ code: "USD", name: "Dólar americano" },
	{ code: "EUR", name: "Euro" },
	{ code: "GBP", name: "Libra esterlina" },
	{ code: "AUD", name: "Dólar australiano" },
	{ code: "CAD", name: "Dólar canadense" },
	{ code: "CHF", name: "Franco suíço" },
	{ code: "CNY", name: "Yuan chinês" },
	{ code: "CZK", name: "Coroa tcheca" },
	{ code: "DKK", name: "Coroa dinamarquesa" },
	{ code: "HKD", name: "Dólar de Hong Kong" },
	{ code: "HUF", name: "Florim húngaro" },
	{ code: "IDR", name: "Rupia indonésia" },
	{ code: "ILS", name: "Novo shekel israelense" },
	{ code: "INR", name: "Rupia indiana" },
	{ code: "ISK", name: "Coroa islandesa" },
	{ code: "JPY", name: "Iene japonês" },
	{ code: "KRW", name: "Won sul-coreano" },
	{ code: "MXN", name: "Peso mexicano" },
	{ code: "MYR", name: "Ringgit malaio" },
	{ code: "NOK", name: "Coroa norueguesa" },
	{ code: "NZD", name: "Dólar neozelandês" },
	{ code: "PHP", name: "Peso filipino" },
	{ code: "PLN", name: "Zloty polonês" },
	{ code: "RON", name: "Leu romeno" },
	{ code: "SEK", name: "Coroa sueca" },
	{ code: "SGD", name: "Dólar de Singapura" },
	{ code: "THB", name: "Baht tailandês" },
	{ code: "TRY", name: "Lira turca" },
	{ code: "ZAR", name: "Rand sul-africano" },
];

export const SUPPORTED_CURRENCY_CODES = new Set(
	SUPPORTED_CURRENCIES.map((currency) => currency.code),
);

/** Moedas cotadas diretamente pelo PTAX do BCB (endpoint `Moedas`). */
export const PTAX_CURRENCIES = new Set([
	"AUD",
	"CAD",
	"CHF",
	"DKK",
	"EUR",
	"GBP",
	"JPY",
	"NOK",
	"SEK",
	"USD",
]);

export const RATE_SOURCES = [
	"PLUGGY",
	"PTAX",
	"FRANKFURTER",
	"MANUAL",
] as const;

export type RateSource = (typeof RATE_SOURCES)[number];
