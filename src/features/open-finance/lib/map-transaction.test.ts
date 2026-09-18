import { describe, expect, it } from "vitest";
import type { PluggyTransaction } from "@/shared/lib/pluggy/schemas";
import { mapPluggyTransactionToInboxItem } from "./map-transaction";

const baseTransaction = {
	id: "tx-1",
	description: "AMAZON WEB SERVICES",
	descriptionRaw: null,
	currencyCode: "BRL",
	amount: 100,
	date: "2026-09-11T00:00:00.000Z",
	type: "DEBIT",
	status: "POSTED",
	accountId: "acc-1",
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
} as unknown as PluggyTransaction;

const context = {
	accountType: "CREDIT" as const,
	connectorName: "Nubank",
	accountCurrency: "BRL",
};

describe("mapPluggyTransactionToInboxItem — moeda", () => {
	it("transacao em BRL numa conta BRL nao gera metadados de cambio", () => {
		const mapped = mapPluggyTransactionToInboxItem(baseTransaction, context);
		expect(mapped.currency).toEqual({ kind: "base" });
		expect(mapped.parsedAmount).toBe("100.00");
	});

	it("usa amountInAccountCurrency quando presente", () => {
		const mapped = mapPluggyTransactionToInboxItem(
			{
				...baseTransaction,
				currencyCode: "USD",
				amount: 100,
				amountInAccountCurrency: 550.72,
			} as PluggyTransaction,
			context,
		);

		expect(mapped.parsedAmount).toBe("550.72");
		expect(mapped.currency).toEqual({
			kind: "converted",
			currency: "USD",
			originAmount: 100,
			rate: 5.5072,
		});
	});

	it("aplica valor absoluto nos dois lados: cartao inverte o sinal", () => {
		const mapped = mapPluggyTransactionToInboxItem(
			{
				...baseTransaction,
				currencyCode: "USD",
				amount: -100,
				amountInAccountCurrency: -550.72,
			} as PluggyTransaction,
			context,
		);

		expect(mapped.parsedAmount).toBe("550.72");
		expect(mapped.currency).toMatchObject({ kind: "converted", rate: 5.5072 });
	});

	it("marca como nao convertida quando falta amountInAccountCurrency", () => {
		const mapped = mapPluggyTransactionToInboxItem(
			{
				...baseTransaction,
				currencyCode: "USD",
				amount: 100,
			} as PluggyTransaction,
			{ ...context, accountCurrency: "USD" },
		);

		expect(mapped.currency).toEqual({
			kind: "unconverted",
			currency: "USD",
			originAmount: 100,
		});
		expect(mapped.parsedAmount).toBe("100.00");
	});

	it("trata moeda de conta nula como BRL", () => {
		const mapped = mapPluggyTransactionToInboxItem(baseTransaction, {
			...context,
			accountCurrency: null,
		});
		expect(mapped.currency).toEqual({ kind: "base" });
	});

	it("nao divide por zero quando amount e zero", () => {
		const mapped = mapPluggyTransactionToInboxItem(
			{
				...baseTransaction,
				currencyCode: "USD",
				amount: 0,
				amountInAccountCurrency: 0,
			} as PluggyTransaction,
			context,
		);

		expect(mapped.currency).toEqual({
			kind: "unconverted",
			currency: "USD",
			originAmount: 0,
		});
	});
});
