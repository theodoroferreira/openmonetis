import { describe, expect, it } from "vitest";
import {
	type InvoiceCandidate,
	listCandidatePeriods,
	matchInvoicePayment,
} from "./invoice-match";

const open = (
	cardId: string,
	period: string,
	total: number,
): InvoiceCandidate => ({
	cardId,
	period,
	total,
	status: "pendente",
	paymentDate: null,
});

const paid = (
	cardId: string,
	period: string,
	total: number,
	paymentDate: string,
): InvoiceCandidate => ({
	cardId,
	period,
	total,
	status: "pago",
	paymentDate: new Date(`${paymentDate}T00:00:00.000Z`),
});

const base = { amount: 1000, date: "2026-11-05", cardId: "a" };

describe("listCandidatePeriods", () => {
	it("cobre o mes anterior, o atual e o seguinte", () => {
		expect(listCandidatePeriods("2026-01-15")).toEqual([
			"2025-12",
			"2026-01",
			"2026-02",
		]);
	});
});

describe("matchInvoicePayment", () => {
	it("liquida a fatura aberta do cartao quando o valor bate", () => {
		const result = matchInvoicePayment({
			...base,
			candidates: [open("a", "2026-11", 1000), open("b", "2026-11", 1000)],
		});

		expect(result).toMatchObject({
			kind: "settle",
			invoice: { cardId: "a", period: "2026-11" },
		});
	});

	it("aceita diferenca de um centavo", () => {
		const result = matchInvoicePayment({
			...base,
			amount: 1000.01,
			candidates: [open("a", "2026-11", 1000)],
		});

		expect(result.kind).toBe("settle");
	});

	it("nao liquida quando o valor diverge e informa as candidatas", () => {
		const result = matchInvoicePayment({
			...base,
			candidates: [open("a", "2026-11", 900)],
		});

		expect(result.kind).toBe("mismatch");
		if (result.kind === "mismatch") {
			expect(result.candidates).toHaveLength(1);
		}
	});

	it("na perna da conta casa pelo valor entre todos os cartoes", () => {
		const result = matchInvoicePayment({
			...base,
			cardId: null,
			candidates: [open("a", "2026-11", 500), open("b", "2026-11", 1000)],
		});

		expect(result).toMatchObject({ kind: "settle", invoice: { cardId: "b" } });
	});

	it("na perna da conta recusa quando duas faturas abertas batem", () => {
		const result = matchInvoicePayment({
			...base,
			cardId: null,
			candidates: [open("a", "2026-11", 1000), open("b", "2026-11", 1000)],
		});

		expect(result.kind).toBe("ambiguous");
	});

	it("fatura ja paga so descarta", () => {
		const result = matchInvoicePayment({
			...base,
			candidates: [paid("a", "2026-11", 1000, "2026-10-20")],
		});

		expect(result.kind).toBe("already_paid");
	});

	it("a segunda perna do mesmo pagamento nao paga a fatura seguinte de mesmo valor", () => {
		const result = matchInvoicePayment({
			...base,
			candidates: [
				paid("a", "2026-11", 1000, "2026-11-05"),
				open("a", "2026-12", 1000),
			],
		});

		expect(result).toMatchObject({
			kind: "already_paid",
			invoice: { period: "2026-11" },
		});
	});

	it("fatura antiga paga de mesmo valor nao bloqueia a fatura aberta", () => {
		const result = matchInvoicePayment({
			...base,
			candidates: [
				paid("a", "2026-10", 1000, "2026-10-01"),
				open("a", "2026-11", 1000),
			],
		});

		expect(result).toMatchObject({
			kind: "settle",
			invoice: { period: "2026-11" },
		});
	});

	it("ignora faturas zeradas", () => {
		const result = matchInvoicePayment({
			...base,
			amount: 0,
			candidates: [open("a", "2026-11", 0)],
		});

		expect(result.kind).toBe("mismatch");
	});
});
