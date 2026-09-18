import {
	CREDIT_CARD_PAYMENT_METHOD,
	type PAYMENT_METHODS,
} from "@/features/transactions/lib/constants";
import type {
	PluggyAccount,
	PluggyTransaction,
} from "@/shared/lib/pluggy/schemas";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseUtcDateString, toDateOnlyString } from "@/shared/utils/date";

export type PluggyTransactionMapped = {
	pluggyTransactionId: string;
	pluggyStatus: string;
	sourceApp: "pluggy";
	sourceAppName: string;
	originalText: string;
	notificationTimestamp: Date;
	parsedName: string;
	parsedAmount: string;
	parsedTransactionType: "Despesa" | "Receita";
	parsedDate: Date;
	parsedPeriod: string;
	parsedPaymentMethod: (typeof PAYMENT_METHODS)[number] | null;
	parsedInstallmentCount: number | null;
	parsedCurrentInstallment: number | null;
	currency: CurrencyResolution;
};

export type PluggyTransactionMapContext = {
	accountType: PluggyAccount["type"];
	connectorName: string;
	accountCurrency: string | null;
};

const BASE_CURRENCY = "BRL";

/**
 * Como a moeda da transacao se resolve. A funcao permanece pura: ela
 * classifica, e quem faz I/O de cotacao e o `sync.ts`, que ja e async.
 */
export type CurrencyResolution =
	| { kind: "base" }
	| { kind: "converted"; currency: string; originAmount: number; rate: number }
	| { kind: "unconverted"; currency: string; originAmount: number };

function resolveCurrency(
	transaction: PluggyTransaction,
	accountCurrency: string,
): CurrencyResolution {
	const currency = transaction.currencyCode;

	if (currency === accountCurrency && currency === BASE_CURRENCY) {
		return { kind: "base" };
	}

	const converted = transaction.amountInAccountCurrency;
	const origin = Math.abs(transaction.amount);

	// `amountInAccountCurrency` so vem quando a moeda da transacao difere da
	// moeda da conta, e ja traz IOF e spread como a instituicao cobrou.
	// O sinal vem invertido em cartao de credito, dai o abs nos dois lados.
	if (typeof converted === "number" && converted !== 0 && origin !== 0) {
		return {
			kind: "converted",
			currency,
			originAmount: origin,
			rate: Math.abs(converted) / origin,
		};
	}

	if (currency === BASE_CURRENCY) {
		return { kind: "base" };
	}

	return { kind: "unconverted", currency, originAmount: origin };
}

const PAYMENT_DATA_METHOD_MAP: Record<
	string,
	(typeof PAYMENT_METHODS)[number]
> = {
	PIX: "Pix",
	TED: "Transferência bancária",
	DOC: "Transferência bancária",
	TEV: "Transferência bancária",
	BOLETO: "Boleto",
};

function toDateOnly(value: string): Date {
	const dateOnlyString = toDateOnlyString(value) ?? value;
	return parseUtcDateString(dateOnlyString) ?? new Date(value);
}

function toPeriod(value: string): string {
	const dateOnlyString = toDateOnlyString(value) ?? value;
	return dateOnlyString.slice(0, 7);
}

function resolvePaymentMethod(
	transaction: PluggyTransaction,
	accountType: PluggyAccount["type"],
): (typeof PAYMENT_METHODS)[number] | null {
	if (accountType === "CREDIT") {
		return CREDIT_CARD_PAYMENT_METHOD;
	}

	const paymentMethod = transaction.paymentData?.paymentMethod;
	if (!paymentMethod) return null;

	return PAYMENT_DATA_METHOD_MAP[paymentMethod] ?? null;
}

/** Traduz uma transacao do Pluggy em pre-lancamento da Inbox. Funcao pura. */
export function mapPluggyTransactionToInboxItem(
	transaction: PluggyTransaction,
	context: PluggyTransactionMapContext,
): PluggyTransactionMapped {
	const creditCardMetadata = transaction.creditCardMetadata;
	const parsedDateSource = creditCardMetadata?.purchaseDate ?? transaction.date;
	const totalInstallments = creditCardMetadata?.totalInstallments ?? null;
	const hasInstallments = totalInstallments !== null && totalInstallments > 1;

	const currency = resolveCurrency(
		transaction,
		context.accountCurrency ?? BASE_CURRENCY,
	);

	return {
		pluggyTransactionId: transaction.id,
		pluggyStatus: transaction.status,
		sourceApp: "pluggy",
		sourceAppName: context.connectorName,
		originalText: transaction.descriptionRaw ?? transaction.description,
		notificationTimestamp: new Date(transaction.date),
		parsedName: transaction.merchant?.name ?? transaction.description,
		parsedAmount: formatDecimalForDbRequired(
			currency.kind === "converted"
				? currency.originAmount * currency.rate
				: Math.abs(transaction.amount),
		),
		parsedTransactionType:
			transaction.type === "CREDIT" ? "Receita" : "Despesa",
		parsedDate: toDateOnly(parsedDateSource),
		parsedPeriod: creditCardMetadata?.billForecastDate
			? toPeriod(creditCardMetadata.billForecastDate)
			: toPeriod(parsedDateSource),
		parsedPaymentMethod: resolvePaymentMethod(transaction, context.accountType),
		parsedInstallmentCount: hasInstallments ? totalInstallments : null,
		parsedCurrentInstallment: hasInstallments
			? (creditCardMetadata?.installmentNumber ?? null)
			: null,
		currency,
	};
}
