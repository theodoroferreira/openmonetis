import { describe, expect, it } from "vitest";
import {
	type ApprovalContext,
	findExchangeLookup,
	type InboxItemForApproval,
	mapInboxItemToTransaction,
	toTitleCase,
} from "./inbox-to-transaction";

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const CARD = "33333333-3333-4333-8333-333333333333";
const PAYER = "44444444-4444-4444-8444-444444444444";

const baseItem: InboxItemForApproval = {
	parsedName: "PADARIA DO JOÃO",
	parsedAmount: "42.50",
	parsedTransactionType: "Despesa",
	parsedDate: new Date("2026-02-25T00:00:00.000Z"),
	notificationTimestamp: new Date("2026-02-26T12:00:00.000Z"),
	parsedPeriod: "2026-02",
	parsedPaymentMethod: "Pix",
	parsedCategoryId: CATEGORY,
	parsedAccountId: null,
	parsedCardId: null,
	parsedInstallmentCount: null,
	parsedCurrency: null,
	parsedOriginAmount: null,
	parsedExchangeRate: null,
	parsedRateSource: null,
	pluggyFlag: null,
};

const baseContext: ApprovalContext = {
	adminPayerId: PAYER,
	linkedAccountId: ACCOUNT,
	linkedCardId: null,
	cards: new Map([[CARD, { closingDay: "22", dueDay: "1" }]]),
	exchange: null,
};

function expectOk(result: ReturnType<typeof mapInboxItemToTransaction>) {
	if (!result.ok) {
		throw new Error(`esperava sucesso, veio ${result.code}`);
	}
	return result.transaction;
}

function expectRefused(
	result: ReturnType<typeof mapInboxItemToTransaction>,
	code: string,
) {
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.code).toBe(code);
}

describe("toTitleCase", () => {
	it("respeita acentos, que \\b\\w quebraria", () => {
		expect(toTitleCase("PADARIA AÇÃO DO JOÃO")).toBe("Padaria Ação Do João");
	});

	it("mantem apostrofos e separadores", () => {
		expect(toTitleCase("mc donald's sao-paulo")).toBe("Mc Donald's Sao-Paulo");
	});
});

describe("mapInboxItemToTransaction", () => {
	it("monta lancamento a vista de conta usando a conta vinculada", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(baseItem, baseContext),
		);

		expect(transaction).toMatchObject({
			name: "Padaria Do João",
			amount: 42.5,
			purchaseDate: "2026-02-25",
			period: "2026-02",
			transactionType: "Despesa",
			condition: "À vista",
			paymentMethod: "Pix",
			accountId: ACCOUNT,
			cardId: null,
			categoryId: CATEGORY,
			payerId: PAYER,
			isSettled: true,
		});
	});

	it("deriva o periodo da fatura em compra no cartao e nao liquida", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedPaymentMethod: "Cartão de crédito" },
				{ ...baseContext, linkedAccountId: null, linkedCardId: CARD },
			),
		);

		expect(transaction.period).toBe("2026-04");
		expect(transaction.cardId).toBe(CARD);
		expect(transaction.accountId).toBeNull();
		expect(transaction.isSettled).toBeNull();
	});

	it("assume cartao de credito quando o destino e cartao sem forma de pagamento", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedPaymentMethod: null },
				{ ...baseContext, linkedAccountId: null, linkedCardId: CARD },
			),
		);

		expect(transaction.paymentMethod).toBe("Cartão de crédito");
	});

	it("aplica overrides do modelo", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(baseItem, baseContext, {
				name: "Padaria",
				categoryId: "55555555-5555-4555-8555-555555555555",
				period: "2026-03",
				isSettled: false,
				note: "lanche",
			}),
		);

		expect(transaction).toMatchObject({
			name: "Padaria",
			categoryId: "55555555-5555-4555-8555-555555555555",
			period: "2026-03",
			isSettled: false,
			note: "lanche",
		});
	});

	it("usa a data da notificacao quando nao ha data parseada", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction({ ...baseItem, parsedDate: null }, baseContext),
		);

		expect(transaction.purchaseDate).toBe("2026-02-26");
	});

	it("preenche a data de pagamento do boleto liquidado", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedPaymentMethod: "Boleto" },
				baseContext,
			),
		);

		expect(transaction.boletoPaymentDate).toBe("2026-02-25");
	});

	it("recusa pagamento de fatura mesmo com override", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, pluggyFlag: "pagamento_fatura_cartao" },
				baseContext,
				{ categoryId: CATEGORY },
			),
			"invoice_payment",
		);
	});

	it("recusa parcelas informadas pelo banco", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedInstallmentCount: 10 },
				baseContext,
			),
			"installments",
		);
	});

	it("recusa parcelas que so aparecem no nome", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedName: "Loja X 3/10" },
				baseContext,
			),
			"installments",
		);
	});

	it("recusa quando falta categoria", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedCategoryId: null },
				baseContext,
			),
			"missing_category",
		);
	});

	it("recusa quando nao ha destino", () => {
		expectRefused(
			mapInboxItemToTransaction(baseItem, {
				...baseContext,
				linkedAccountId: null,
			}),
			"missing_destination",
		);
	});

	it("recusa conta sem forma de pagamento", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedPaymentMethod: null },
				baseContext,
			),
			"missing_payment_method",
		);
	});

	it("recusa forma de pagamento incompativel com o destino", () => {
		expectRefused(
			mapInboxItemToTransaction(baseItem, baseContext, {
				paymentMethod: "Cartão de crédito",
			}),
			"destination_mismatch",
		);
		expectRefused(
			mapInboxItemToTransaction(
				baseItem,
				{ ...baseContext, linkedAccountId: null, linkedCardId: CARD },
				{ paymentMethod: "Pix" },
			),
			"destination_mismatch",
		);
	});

	it("recusa sem valor, sem nome ou sem pessoa", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{ ...baseItem, parsedAmount: null },
				baseContext,
			),
			"missing_amount",
		);
		expectRefused(
			mapInboxItemToTransaction({ ...baseItem, parsedName: " " }, baseContext),
			"missing_name",
		);
		expectRefused(
			mapInboxItemToTransaction(baseItem, {
				...baseContext,
				adminPayerId: null,
			}),
			"missing_payer",
		);
	});

	it("mantem o cambio ja gravado no item", () => {
		const transaction = expectOk(
			mapInboxItemToTransaction(
				{
					...baseItem,
					parsedAmount: "550.00",
					parsedCurrency: "USD",
					parsedOriginAmount: "100.00",
					parsedExchangeRate: "5.50000000",
					parsedRateSource: "PLUGGY",
				},
				baseContext,
			),
		);

		expect(transaction).toMatchObject({
			amount: 550,
			originCurrency: "USD",
			originAmount: 100,
			exchangeRate: 5.5,
			rateSource: "PLUGGY",
			rateDate: "2026-02-25",
		});
	});

	it("converte com a cotacao buscada quando o item nao tem taxa", () => {
		const item = {
			...baseItem,
			parsedAmount: "100.00",
			parsedCurrency: "USD",
			parsedOriginAmount: "100.00",
		};

		expect(findExchangeLookup(item, undefined)).toEqual({
			currency: "USD",
			date: "2026-02-25",
		});

		const transaction = expectOk(
			mapInboxItemToTransaction(item, {
				...baseContext,
				exchange: { rate: 5.123, source: "PTAX", rateDate: "2026-02-24" },
			}),
		);

		expect(transaction).toMatchObject({
			amount: 512.3,
			originAmount: 100,
			exchangeRate: 5.123,
			rateSource: "PTAX",
			rateDate: "2026-02-24",
		});
	});

	it("recusa moeda estrangeira sem cotacao", () => {
		expectRefused(
			mapInboxItemToTransaction(
				{
					...baseItem,
					parsedCurrency: "USD",
					parsedOriginAmount: "100.00",
				},
				baseContext,
			),
			"missing_exchange_rate",
		);
	});

	it("nao busca cotacao para BRL nem quando o item ja tem taxa", () => {
		expect(findExchangeLookup(baseItem, undefined)).toBeNull();
		expect(
			findExchangeLookup(
				{ ...baseItem, parsedCurrency: "USD", parsedExchangeRate: "5.5" },
				undefined,
			),
		).toBeNull();
	});
});
