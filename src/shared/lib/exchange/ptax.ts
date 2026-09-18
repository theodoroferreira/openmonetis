import { shiftIsoDate } from "./dates";

const PTAX_ENDPOINT =
	"https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)";

/**
 * O boletim de fechamento chama-se "Fechamento PTAX", nao "Fechamento".
 * Filtrar pela string errada devolve lista vazia, o que e indistinguivel
 * de feriado — por isso a comparacao e exata e tem teste dedicado.
 */
const CLOSING_BULLETIN = "Fechamento PTAX";

/** Quantos dias retroceder procurando o ultimo dia util com cotacao. */
const MAX_LOOKBACK_DAYS = 5;

const REQUEST_TIMEOUT_MS = 4000;

type PtaxBulletin = {
	tipoBoletim?: unknown;
	cotacaoVenda?: unknown;
};

/** O BCB espera a data em MM-DD-YYYY, entre aspas simples na query. */
export function toPtaxDate(isoDate: string): string {
	const [year, month, day] = isoDate.split("-");
	return `${month}-${day}-${year}`;
}

export function parsePtaxResponse(payload: unknown): number | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}

	const { value } = payload as { value?: unknown };
	if (!Array.isArray(value)) {
		return null;
	}

	const closing = (value as PtaxBulletin[]).find(
		(bulletin) => bulletin.tipoBoletim === CLOSING_BULLETIN,
	);

	const rate = closing?.cotacaoVenda;
	if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
		return null;
	}

	return rate;
}

function buildPtaxUrl(currency: string, isoDate: string): string {
	const params = new URLSearchParams({
		"@moeda": `'${currency}'`,
		"@dataCotacao": `'${toPtaxDate(isoDate)}'`,
		$format: "json",
	});
	return `${PTAX_ENDPOINT}?${params.toString()}`;
}

/**
 * Busca a cotacao de fechamento do PTAX, retrocedendo ate achar dia util.
 * Devolve `null` quando a moeda nao e coberta, quando a rede falha, ou
 * quando nao ha cotacao dentro da janela de retrocesso.
 */
export async function fetchPtaxRate(
	currency: string,
	isoDate: string,
): Promise<{ taxa: number; dataCotacao: string } | null> {
	for (let offset = 0; offset < MAX_LOOKBACK_DAYS; offset += 1) {
		const candidate = shiftIsoDate(isoDate, -offset);

		try {
			const response = await fetch(buildPtaxUrl(currency, candidate), {
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (!response.ok) {
				return null;
			}

			const rate = parsePtaxResponse(await response.json());
			if (rate !== null) {
				return { taxa: rate, dataCotacao: candidate };
			}
		} catch {
			// Timeout, rede fora ou JSON invalido: PTAX conta como indisponivel
			// e quem chama segue para o Frankfurter.
			return null;
		}
	}

	return null;
}
