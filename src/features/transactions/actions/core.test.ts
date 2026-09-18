import { describe, expect, it } from "vitest";
import {
	buildOriginAmountsForRows,
	buildTransactionRecords,
	distributeProportionally,
} from "./core";

describe("distributeProportionally", () => {
	it("reparte proporcionalmente aos pesos", () => {
		expect(distributeProportionally(10000, [5000, 5000])).toEqual([5000, 5000]);
	});

	it("soma exatamente o total mesmo com divisao inexata", () => {
		const parts = distributeProportionally(10000, [3333, 3333, 3334]);
		expect(parts.reduce((acc, part) => acc + part, 0)).toBe(10000);
	});

	it("distribui o resto pelos maiores fracionarios", () => {
		expect(distributeProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
	});

	it("devolve zeros quando os pesos somam zero", () => {
		expect(distributeProportionally(10000, [0, 0])).toEqual([0, 0]);
	});

	it("lida com peso unico", () => {
		expect(distributeProportionally(12345, [999])).toEqual([12345]);
	});

	it("preserva o total em divisao 70/30 com centavo quebrado", () => {
		const parts = distributeProportionally(10001, [7000, 3000]);
		expect(parts.reduce((acc, part) => acc + part, 0)).toBe(10001);
	});
});

describe("buildOriginAmountsForRows", () => {
	it("rateia o total de origem entre as linhas proporcional ao peso em BRL e sinaliza como despesa", () => {
		const parts = buildOriginAmountsForRows(10000, [33945, 16973], -1);
		expect(parts).toEqual(["-66.67", "-33.33"]);
	});

	it("sinaliza como receita quando amountSign e 1", () => {
		const parts = buildOriginAmountsForRows(10000, [5000, 5000], 1);
		expect(parts).toEqual(["50.00", "50.00"]);
	});

	it("a soma das partes em centavos bate com o total de origem", () => {
		const parts = buildOriginAmountsForRows(10001, [7000, 3000], -1);
		const somaCents = parts.reduce(
			(acc, value) => acc + Math.round(Math.abs(Number(value)) * 100),
			0,
		);
		expect(somaCents).toBe(10001);
	});

	it("lida com uma unica linha (dupla sem parceiro encontrado)", () => {
		expect(buildOriginAmountsForRows(12345, [999], -1)).toEqual(["-123.45"]);
	});
});

describe("buildTransactionRecords com moeda de origem", () => {
	const base = {
		userId: "user-1",
		period: "2026-09",
		purchaseDate: new Date("2026-09-11T00:00:00.000Z"),
		dueDate: null,
		boletoPaymentDate: null,
		amountSign: -1 as const,
		shouldNullifySettled: false,
		seriesId: null,
		exchange: {
			currency: "USD",
			rate: 5.0918,
			source: "PTAX",
			rateDate: "2026-09-11",
		},
	};

	const data = {
		name: "Compra internacional",
		transactionType: "Despesa",
		condition: "À vista",
		paymentMethod: "Cartão de crédito",
		note: null,
		accountId: null,
		cardId: null,
		categoryId: null,
		isSplit: false,
		isSettled: false,
	} as Parameters<typeof buildTransactionRecords>[0]["data"];

	it("propaga moeda, taxa, fonte e data para todas as linhas", () => {
		const records = buildTransactionRecords({
			...base,
			data,
			shares: [{ payerId: "p1", amountCents: 50918 }],
			originShareCents: [10000],
		});

		expect(records).toHaveLength(1);
		expect(records[0].originCurrency).toBe("USD");
		expect(records[0].originAmount).toBe("-100.00");
		expect(records[0].exchangeRate).toBe("5.09180000");
		expect(records[0].rateSource).toBe("PTAX");
		expect(records[0].rateDate).toBe("2026-09-11");
	});

	it("deixa os campos de cambio nulos quando exchange e null", () => {
		const records = buildTransactionRecords({
			...base,
			exchange: null,
			data,
			shares: [{ payerId: "p1", amountCents: 50918 }],
			originShareCents: null,
		});

		expect(records[0].originCurrency).toBeNull();
		expect(records[0].originAmount).toBeNull();
	});

	it("parcelamento: as parcelas em origem somam o total de origem", () => {
		const records = buildTransactionRecords({
			...base,
			data: {
				...data,
				condition: "Parcelado",
				installmentCount: 3,
				startInstallment: 1,
			} as typeof data,
			shares: [{ payerId: "p1", amountCents: 50918 }],
			originShareCents: [10000],
		});

		expect(records).toHaveLength(3);
		const somaOrigem = records.reduce(
			(acc, record) => acc + Math.round(Number(record.originAmount) * 100),
			0,
		);
		expect(somaOrigem).toBe(-10000);
	});

	it("a vista: vale a invariante valor = round(valor_origem x taxa, 2)", () => {
		const records = buildTransactionRecords({
			...base,
			data,
			shares: [{ payerId: "p1", amountCents: 50918 }],
			originShareCents: [10000],
		});

		const origem = Number(records[0].originAmount);
		const taxa = Number(records[0].exchangeRate);
		expect(Number(records[0].amount)).toBe(
			Math.round(origem * taxa * 100) / 100,
		);
	});

	it("divisao: as partes em origem somam o total de origem", () => {
		const records = buildTransactionRecords({
			...base,
			data: { ...data, isSplit: true } as typeof data,
			shares: [
				{ payerId: "p1", amountCents: 33945 },
				{ payerId: "p2", amountCents: 16973 },
			],
			originShareCents: distributeProportionally(10000, [33945, 16973]),
		});

		const somaOrigem = records.reduce(
			(acc, record) => acc + Math.round(Number(record.originAmount) * 100),
			0,
		);
		expect(somaOrigem).toBe(-10000);
	});
});
