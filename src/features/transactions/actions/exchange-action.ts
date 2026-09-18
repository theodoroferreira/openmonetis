"use server";

import { z } from "zod";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { BASE_CURRENCY } from "@/shared/lib/exchange/constants";
import {
	type ExchangeRate,
	getExchangeRate,
} from "@/shared/lib/exchange/get-rate";
import type { ActionResult } from "@/shared/lib/types/actions";

const fetchExchangeRateSchema = z.object({
	currency: z.string().trim().length(3, "Selecione uma moeda válida."),
	date: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
});

/**
 * Busca a cotacao para o dialogo de lancamento.
 *
 * `data: null` significa que nenhuma fonte respondeu — o dialogo pede a taxa
 * na mao. Nunca e erro: nao poder registrar uma despesa porque o BCB caiu
 * seria pior do que uma taxa manual.
 */
export async function fetchExchangeRateAction(
	input: z.input<typeof fetchExchangeRateSchema>,
): Promise<ActionResult<ExchangeRate | null>> {
	try {
		await getUser();
		const data = fetchExchangeRateSchema.parse(input);

		if (data.currency === BASE_CURRENCY) {
			return { success: true, message: "Moeda base.", data: null };
		}

		return {
			success: true,
			message: "Cotação consultada.",
			data: await getExchangeRate(data.currency, data.date),
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<ExchangeRate | null>;
	}
}
