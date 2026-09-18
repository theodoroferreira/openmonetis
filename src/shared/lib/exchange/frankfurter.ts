import { BASE_CURRENCY } from "./constants";

/**
 * Host `.dev`: `api.frankfurter.app` responde 301 e exige seguir redirect.
 */
const FRANKFURTER_ENDPOINT = "https://api.frankfurter.dev/v1";

const REQUEST_TIMEOUT_MS = 4000;

export function parseFrankfurterResponse(
	payload: unknown,
): { taxa: number; dataCotacao: string } | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}

	const { date, rates } = payload as { date?: unknown; rates?: unknown };

	if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return null;
	}

	if (typeof rates !== "object" || rates === null) {
		return null;
	}

	const taxa = (rates as Record<string, unknown>)[BASE_CURRENCY];
	if (typeof taxa !== "number" || !Number.isFinite(taxa) || taxa <= 0) {
		return null;
	}

	return { taxa, dataCotacao: date };
}

/**
 * O Frankfurter resolve dia nao util sozinho e declara no campo `date` qual
 * data realmente usou — por isso nao ha retrocesso manual aqui.
 */
export async function fetchFrankfurterRate(
	currency: string,
	isoDate: string,
): Promise<{ taxa: number; dataCotacao: string } | null> {
	const params = new URLSearchParams({
		base: currency,
		symbols: BASE_CURRENCY,
	});

	try {
		const response = await fetch(
			`${FRANKFURTER_ENDPOINT}/${isoDate}?${params.toString()}`,
			{ signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
		);

		if (!response.ok) {
			return null;
		}

		return parseFrankfurterResponse(await response.json());
	} catch {
		return null;
	}
}
