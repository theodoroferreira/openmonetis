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
};

export type PluggyTransactionMapContext = {
	accountType: PluggyAccount["type"];
	connectorName: string;
};

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

	return {
		pluggyTransactionId: transaction.id,
		pluggyStatus: transaction.status,
		sourceApp: "pluggy",
		sourceAppName: context.connectorName,
		originalText: transaction.descriptionRaw ?? transaction.description,
		notificationTimestamp: new Date(transaction.date),
		parsedName: transaction.merchant?.name ?? transaction.description,
		parsedAmount: formatDecimalForDbRequired(Math.abs(transaction.amount)),
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
	};
}
