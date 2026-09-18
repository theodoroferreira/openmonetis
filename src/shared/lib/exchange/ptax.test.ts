import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPtaxRate, parsePtaxResponse, toPtaxDate } from "./ptax";

const RESPOSTA_DIA_UTIL = {
	value: [
		{ tipoBoletim: "Abertura", cotacaoCompra: 5.0748, cotacaoVenda: 5.0754 },
		{
			tipoBoletim: "Intermediário",
			cotacaoCompra: 5.0903,
			cotacaoVenda: 5.0909,
		},
		{
			tipoBoletim: "Intermediário",
			cotacaoCompra: 5.1001,
			cotacaoVenda: 5.1007,
		},
		{
			tipoBoletim: "Intermediário",
			cotacaoCompra: 5.0996,
			cotacaoVenda: 5.1002,
		},
		{
			tipoBoletim: "Fechamento PTAX",
			cotacaoCompra: 5.0912,
			cotacaoVenda: 5.0918,
		},
	],
};

describe("toPtaxDate", () => {
	it("converte YYYY-MM-DD para MM-DD-YYYY", () => {
		expect(toPtaxDate("2026-09-11")).toBe("09-11-2026");
	});
});

describe("parsePtaxResponse", () => {
	it("seleciona o boletim de fechamento, nao o de abertura", () => {
		expect(parsePtaxResponse(RESPOSTA_DIA_UTIL)).toBe(5.0918);
	});

	it("retorna null em dia nao util (value vazio)", () => {
		expect(parsePtaxResponse({ value: [] })).toBeNull();
	});

	it("retorna null quando so ha boletins intermediarios", () => {
		expect(
			parsePtaxResponse({
				value: [{ tipoBoletim: "Intermediário", cotacaoVenda: 5.1 }],
			}),
		).toBeNull();
	});

	it("nao confunde 'Fechamento' com 'Fechamento PTAX'", () => {
		expect(
			parsePtaxResponse({
				value: [{ tipoBoletim: "Fechamento", cotacaoVenda: 9.99 }],
			}),
		).toBeNull();
	});

	it("retorna null para payload malformado", () => {
		expect(parsePtaxResponse(null)).toBeNull();
		expect(parsePtaxResponse({})).toBeNull();
		expect(parsePtaxResponse({ value: "nao e array" })).toBeNull();
	});

	it("rejeita cotacao zero ou negativa", () => {
		expect(
			parsePtaxResponse({
				value: [{ tipoBoletim: "Fechamento PTAX", cotacaoVenda: 0 }],
			}),
		).toBeNull();
	});
});

describe("fetchPtaxRate — retrocesso de dia util", () => {
	const respostaVazia = { value: [] };

	const mockFetchPorData = (respostas: Record<string, unknown>) =>
		vi.fn(async (url: string) => {
			const match = url.match(/%27(\d{2}-\d{2}-\d{4})%27/);
			const ptaxDate = match?.[1] ?? "";
			return {
				ok: true,
				json: async () => respostas[ptaxDate] ?? respostaVazia,
			} as Response;
		});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("usa o proprio dia quando ele e util", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchPorData({ "09-11-2026": RESPOSTA_DIA_UTIL }),
		);

		await expect(fetchPtaxRate("USD", "2026-09-11")).resolves.toEqual({
			taxa: 5.0918,
			dataCotacao: "2026-09-11",
		});
	});

	it("retrocede de domingo ate a sexta anterior", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchPorData({ "09-11-2026": RESPOSTA_DIA_UTIL }),
		);

		// 2026-09-12 e sabado; 09-13 domingo. A sexta e 09-11.
		await expect(fetchPtaxRate("USD", "2026-09-13")).resolves.toEqual({
			taxa: 5.0918,
			dataCotacao: "2026-09-11",
		});
	});

	it("desiste depois de 5 tentativas em feriado prolongado", async () => {
		const fetchMock = mockFetchPorData({});
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchPtaxRate("USD", "2026-09-13")).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it("retorna null sem retroceder quando a rede falha", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("network down");
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchPtaxRate("USD", "2026-09-11")).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
