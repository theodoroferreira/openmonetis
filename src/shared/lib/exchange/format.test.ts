import { describe, expect, it } from "vitest";
import { formatForeignCurrency } from "./format";

describe("formatForeignCurrency", () => {
	it("formata USD com simbolo e separadores pt-BR", () => {
		expect(formatForeignCurrency(1234.5, "USD")).toBe("US$ 1.234,50");
	});

	it("formata EUR", () => {
		expect(formatForeignCurrency(100, "EUR")).toBe("€ 100,00");
	});

	it("usa o valor absoluto: o sinal fica a cargo de quem exibe", () => {
		expect(formatForeignCurrency(-100, "USD")).toBe("US$ 100,00");
	});

	it("cai para o codigo quando a moeda e desconhecida do Intl", () => {
		expect(formatForeignCurrency(10, "XXX")).toContain("10,00");
	});
});
