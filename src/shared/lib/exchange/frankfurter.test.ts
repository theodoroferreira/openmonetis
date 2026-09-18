import { describe, expect, it } from "vitest";
import { parseFrankfurterResponse } from "./frankfurter";

describe("parseFrankfurterResponse", () => {
	it("le a taxa BRL e a data devolvida pela API", () => {
		expect(
			parseFrankfurterResponse({
				amount: 1.0,
				base: "USD",
				date: "2026-09-11",
				rates: { BRL: 5.1108 },
			}),
		).toEqual({ taxa: 5.1108, dataCotacao: "2026-09-11" });
	});

	it("usa a data devolvida, nao a pedida, em dia nao util", () => {
		// Pedido em 2026-09-12 (sabado); a API respondeu com a sexta.
		const resultado = parseFrankfurterResponse({
			amount: 1.0,
			base: "USD",
			date: "2026-09-11",
			rates: { BRL: 5.1108 },
		});
		expect(resultado?.dataCotacao).toBe("2026-09-11");
	});

	it("retorna null quando BRL nao esta em rates", () => {
		expect(
			parseFrankfurterResponse({ date: "2026-09-11", rates: { USD: 1 } }),
		).toBeNull();
	});

	it("retorna null para payload malformado", () => {
		expect(parseFrankfurterResponse(null)).toBeNull();
		expect(parseFrankfurterResponse({})).toBeNull();
		expect(parseFrankfurterResponse({ date: "2026-09-11" })).toBeNull();
	});

	it("rejeita taxa zero ou negativa", () => {
		expect(
			parseFrankfurterResponse({ date: "2026-09-11", rates: { BRL: 0 } }),
		).toBeNull();
	});
});
