import { describe, expect, it } from "vitest";
import {
	type ExistingTransaction,
	isEditableByTool,
	mergeSeriesUpdate,
	mergeTransactionUpdate,
} from "./transaction-update";

const existing: ExistingTransaction = {
	name: "Mercado",
	amount: "-100.00",
	purchaseDate: new Date("2026-10-05T00:00:00.000Z"),
	period: "2026-10",
	transactionType: "Despesa",
	condition: "Parcelado",
	paymentMethod: "Cartão de crédito",
	categoryId: "cat",
	payerId: "payer",
	accountId: null,
	cardId: "card",
	note: "manter",
	installmentCount: 3,
	recurrenceCount: null,
	dueDate: null,
	boletoPaymentDate: null,
	isSettled: null,
	originCurrency: "USD",
	originAmount: "-20.00",
	exchangeRate: "5.00000000",
	rateSource: "PTAX",
	rateDate: "2026-10-04",
};

describe("mergeTransactionUpdate", () => {
	it("preserva o que nao foi informado", () => {
		expect(mergeTransactionUpdate(existing, { name: "Feira" })).toMatchObject({
			name: "Feira",
			amount: 100,
			purchaseDate: "2026-10-05",
			period: "2026-10",
			categoryId: "cat",
			cardId: "card",
			note: "manter",
			installmentCount: 3,
			originCurrency: "USD",
			originAmount: 20,
			exchangeRate: 5,
		});
	});

	it("permite limpar a anotacao com null", () => {
		expect(mergeTransactionUpdate(existing, { note: null }).note).toBeNull();
	});

	it("deixa o periodo ser recalculado quando a data ou o cartao mudam", () => {
		expect(
			mergeTransactionUpdate(existing, { purchaseDate: "2026-10-30" }).period,
		).toBeUndefined();
		expect(
			mergeTransactionUpdate(existing, {
				purchaseDate: "2026-10-30",
				period: "2026-12",
			}).period,
		).toBe("2026-12");
	});

	it("descarta o cambio obsoleto quando o valor muda sem nova cotacao", () => {
		expect(mergeTransactionUpdate(existing, { amount: 90 })).toMatchObject({
			amount: 90,
			originCurrency: null,
			originAmount: null,
			exchangeRate: null,
			rateSource: null,
			rateDate: null,
		});
	});
});

describe("isEditableByTool", () => {
	it("recusa transferencia, porque a action inverteria o sinal da saida", () => {
		expect(
			isEditableByTool({ ...existing, transactionType: "Transferência" }),
		).toBe(false);
		expect(isEditableByTool(existing)).toBe(true);
	});
});

describe("mergeSeriesUpdate", () => {
	it("nao deixa a action zerar categoria, destino, pessoa e anotacao", () => {
		expect(
			mergeSeriesUpdate(existing, {
				id: "id",
				scope: "all",
				amount: 50,
			}),
		).toEqual({
			id: "id",
			scope: "all",
			name: "Mercado",
			amount: 50,
			categoryId: "cat",
			payerId: "payer",
			accountId: null,
			cardId: "card",
			note: "manter",
		});
	});
});
