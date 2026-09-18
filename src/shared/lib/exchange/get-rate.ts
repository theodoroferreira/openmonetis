import { and, eq } from "drizzle-orm";
import { exchangeRates } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	BASE_CURRENCY,
	PTAX_CURRENCIES,
	SUPPORTED_CURRENCY_CODES,
} from "./constants";
import { fetchFrankfurterRate } from "./frankfurter";
import { fetchPtaxRate } from "./ptax";

export type ExchangeRate = {
	taxa: number;
	fonte: "PTAX" | "FRANKFURTER";
	dataCotacao: string;
};

/**
 * Resolve a cotacao de `currency` para BRL na data da compra.
 *
 * Ordem: cache -> PTAX (so nas moedas que ele cota) -> Frankfurter.
 *
 * `null` tem um significado so: nenhuma fonte respondeu. Quem chama degrada
 * para entrada manual. Chamar com BRL e erro de programacao, nao caso de
 * uso — BRL nao e conversao.
 */
export async function getExchangeRate(
	currency: string,
	isoDate: string,
): Promise<ExchangeRate | null> {
	if (currency === BASE_CURRENCY) {
		throw new Error(
			"getExchangeRate nao aceita BRL: verifique a moeda antes de chamar.",
		);
	}

	if (!SUPPORTED_CURRENCY_CODES.has(currency)) {
		return null;
	}

	const cached = await db.query.exchangeRates.findFirst({
		where: and(
			eq(exchangeRates.currency, currency),
			eq(exchangeRates.date, isoDate),
		),
	});

	if (cached) {
		return {
			taxa: Number(cached.rate),
			fonte: cached.source as ExchangeRate["fonte"],
			dataCotacao: cached.rateDate,
		};
	}

	const resolved = PTAX_CURRENCIES.has(currency)
		? await fetchPtaxRate(currency, isoDate).then((result) =>
				result ? { ...result, fonte: "PTAX" as const } : null,
			)
		: null;

	const fallback =
		resolved ??
		(await fetchFrankfurterRate(currency, isoDate).then((result) =>
			result ? { ...result, fonte: "FRANKFURTER" as const } : null,
		));

	if (!fallback) {
		return null;
	}

	// Cotacao historica e imutavel: conflito so pode ser corrida entre duas
	// requisicoes simultaneas pedindo o mesmo par, entao ignorar e correto.
	await db
		.insert(exchangeRates)
		.values({
			currency,
			date: isoDate,
			rate: fallback.taxa.toFixed(8),
			source: fallback.fonte,
			rateDate: fallback.dataCotacao,
		})
		.onConflictDoNothing();

	return {
		taxa: fallback.taxa,
		fonte: fallback.fonte,
		dataCotacao: fallback.dataCotacao,
	};
}
