import type { CreateInput } from "@/features/transactions/actions/core";
import {
	CREDIT_CARD_PAYMENT_METHOD,
	type PAYMENT_METHODS,
} from "@/features/transactions/lib/constants";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import {
	BASE_CURRENCY,
	type RateSource,
} from "@/shared/lib/exchange/constants";

type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type InboxItemForApproval = {
	parsedName: string | null;
	parsedAmount: string | null;
	parsedTransactionType: string | null;
	parsedDate: Date | null;
	notificationTimestamp: Date;
	parsedPeriod: string | null;
	parsedPaymentMethod: string | null;
	parsedCategoryId: string | null;
	parsedAccountId: string | null;
	parsedCardId: string | null;
	parsedInstallmentCount: number | null;
	parsedCurrency: string | null;
	parsedOriginAmount: string | null;
	parsedExchangeRate: string | null;
	parsedRateSource: string | null;
	pluggyFlag: string | null;
};

export type ApprovalOverrides = {
	name?: string;
	categoryId?: string;
	accountId?: string;
	cardId?: string;
	payerId?: string;
	paymentMethod?: PaymentMethod;
	transactionType?: "Despesa" | "Receita";
	purchaseDate?: string;
	period?: string;
	note?: string;
	isSettled?: boolean;
};

export type ApprovalContext = {
	adminPayerId: string | null;
	/** Destino vindo de `contas_pluggy`; `parsed_conta_id` nunca é gravado. */
	linkedAccountId: string | null;
	linkedCardId: string | null;
	cards: Map<string, { closingDay: string | null; dueDay: string | null }>;
	/** Cotação buscada no servidor para item estrangeiro sem taxa gravada. */
	exchange: { rate: number; source: RateSource; rateDate: string } | null;
};

export type ApprovalRefusalCode =
	| "invoice_payment"
	| "installments"
	| "missing_amount"
	| "missing_name"
	| "missing_category"
	| "missing_destination"
	| "missing_payment_method"
	| "destination_mismatch"
	| "missing_payer"
	| "missing_exchange_rate";

export type ApprovalMapping =
	| { ok: true; transaction: CreateInput }
	| { ok: false; code: ApprovalRefusalCode; reason: string };

const refuse = (
	code: ApprovalRefusalCode,
	reason: string,
): Extract<ApprovalMapping, { ok: false }> => ({ ok: false, code, reason });

/** Title case ciente de acentos: `\b\w` quebraria "AÇÃO" em "AçãO". */
export function toTitleCase(value: string): string {
	return value
		.toLowerCase()
		.replace(/(^|[\s\-/])(\p{L})/gu, (_, separator, letter) => {
			return `${separator}${letter.toUpperCase()}`;
		});
}

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

function resolvePurchaseDate(
	item: InboxItemForApproval,
	overrides?: ApprovalOverrides,
): string {
	return (
		overrides?.purchaseDate ??
		toDateOnly(item.parsedDate ?? item.notificationTimestamp)
	);
}

const isForeignCurrency = (item: InboxItemForApproval) =>
	Boolean(item.parsedCurrency && item.parsedCurrency !== BASE_CURRENCY);

/**
 * Item estrangeiro sem taxa precisa de cotação antes do mapeamento, que é puro.
 * Devolve o que buscar, ou `null` quando nada precisa ser buscado.
 */
export function findExchangeLookup(
	item: InboxItemForApproval,
	overrides: ApprovalOverrides | undefined,
): { currency: string; date: string } | null {
	if (!isForeignCurrency(item) || item.parsedExchangeRate) {
		return null;
	}

	return {
		currency: item.parsedCurrency as string,
		date: resolvePurchaseDate(item, overrides),
	};
}

type ResolvedExchange = {
	amount: number;
	fields: Pick<
		CreateInput,
		| "originCurrency"
		| "originAmount"
		| "exchangeRate"
		| "rateSource"
		| "rateDate"
	>;
};

function resolveExchange(
	item: InboxItemForApproval,
	purchaseDate: string,
	amount: number,
	exchange: ApprovalContext["exchange"],
): ResolvedExchange | null {
	const originAmount = Math.abs(Number(item.parsedOriginAmount ?? Number.NaN));

	if (!Number.isFinite(originAmount)) {
		return null;
	}

	const originCurrency = item.parsedCurrency;

	if (item.parsedExchangeRate && item.parsedRateSource) {
		return {
			amount,
			fields: {
				originCurrency,
				originAmount,
				exchangeRate: Number(item.parsedExchangeRate),
				rateSource: item.parsedRateSource as RateSource,
				rateDate: purchaseDate,
			},
		};
	}

	if (!exchange) {
		return null;
	}

	// Sem taxa, o sync grava em `parsed_amount` o valor na moeda de origem.
	return {
		amount: Math.round(originAmount * exchange.rate * 100) / 100,
		fields: {
			originCurrency,
			originAmount,
			exchangeRate: exchange.rate,
			rateSource: exchange.source,
			rateDate: exchange.rateDate,
		},
	};
}

/**
 * Faz no servidor o que o diálogo de lançamento faz no navegador ao processar
 * um item da inbox. Função pura: recusa em vez de adivinhar, e o item recusado
 * continua pendente.
 */
export function mapInboxItemToTransaction(
	item: InboxItemForApproval,
	context: ApprovalContext,
	overrides?: ApprovalOverrides,
): ApprovalMapping {
	// Primeiro de tudo: nenhum override transforma pagamento de fatura em despesa.
	if (item.pluggyFlag) {
		return refuse(
			"invoice_payment",
			"Pagamento de fatura não vira lançamento: use settle_invoice_payment_items.",
		);
	}

	if (
		(item.parsedInstallmentCount ?? 0) > 1 ||
		detectInstallmentFromName(item.parsedName)
	) {
		return refuse(
			"installments",
			"Parcelas ficam para revisão manual: o valor recebido é o da parcela e a série pode já existir.",
		);
	}

	const parsedAmount = Math.abs(Number(item.parsedAmount ?? Number.NaN));
	if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
		return refuse("missing_amount", "O item não tem valor.");
	}

	const name =
		overrides?.name?.trim() || toTitleCase(item.parsedName ?? "").trim();
	if (!name) {
		return refuse("missing_name", "O item não tem nome: informe em overrides.");
	}

	const categoryId = overrides?.categoryId ?? item.parsedCategoryId;
	if (!categoryId) {
		return refuse(
			"missing_category",
			"O item não tem categoria: informe em overrides.",
		);
	}

	const payerId = overrides?.payerId ?? context.adminPayerId;
	if (!payerId) {
		return refuse("missing_payer", "Pessoa administradora não encontrada.");
	}

	const hasDestinationOverride = Boolean(
		overrides?.accountId || overrides?.cardId,
	);
	const accountId = hasDestinationOverride
		? (overrides?.accountId ?? null)
		: (context.linkedAccountId ?? item.parsedAccountId);
	const cardId = hasDestinationOverride
		? (overrides?.cardId ?? null)
		: (context.linkedCardId ?? item.parsedCardId);

	if (!accountId && !cardId) {
		return refuse(
			"missing_destination",
			"O item não tem conta nem cartão: informe em overrides.",
		);
	}

	const paymentMethod =
		overrides?.paymentMethod ??
		(cardId
			? CREDIT_CARD_PAYMENT_METHOD
			: (item.parsedPaymentMethod as PaymentMethod | null));

	if (!paymentMethod) {
		return refuse(
			"missing_payment_method",
			"O item não tem forma de pagamento: informe em overrides.",
		);
	}

	const isCreditCard = paymentMethod === CREDIT_CARD_PAYMENT_METHOD;
	if (isCreditCard !== Boolean(cardId)) {
		return refuse(
			"destination_mismatch",
			"Cartão de crédito exige cartão como destino, e as demais formas exigem conta.",
		);
	}

	const purchaseDate = resolvePurchaseDate(item, overrides);

	let amount = parsedAmount;
	let exchangeFields: ResolvedExchange["fields"] | undefined;

	if (isForeignCurrency(item)) {
		const exchange = resolveExchange(
			item,
			purchaseDate,
			parsedAmount,
			context.exchange,
		);

		if (!exchange) {
			return refuse(
				"missing_exchange_rate",
				"Moeda estrangeira sem cotação disponível.",
			);
		}

		amount = exchange.amount;
		exchangeFields = exchange.fields;
	}

	const card = cardId ? context.cards.get(cardId) : undefined;
	const period =
		overrides?.period ??
		(cardId
			? deriveCreditCardPeriod(purchaseDate, card?.closingDay, card?.dueDay)
			: (item.parsedPeriod ?? purchaseDate.slice(0, 7)));

	// Explícito porque o diálogo assume liquidado e a action assume o contrário.
	const isSettled = isCreditCard ? null : (overrides?.isSettled ?? true);

	return {
		ok: true,
		transaction: {
			purchaseDate,
			period,
			name,
			transactionType:
				overrides?.transactionType ??
				(item.parsedTransactionType === "Receita" ? "Receita" : "Despesa"),
			amount,
			condition: "À vista",
			paymentMethod,
			payerId,
			isSplit: false,
			accountId: isCreditCard ? null : accountId,
			cardId: isCreditCard ? cardId : null,
			categoryId,
			note: overrides?.note ?? null,
			isSettled,
			boletoPaymentDate:
				paymentMethod === "Boleto" && isSettled ? purchaseDate : undefined,
			...exchangeFields,
		},
	};
}
