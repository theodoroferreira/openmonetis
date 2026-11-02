import type { transactions } from "@/db/schema";
import type {
	UpdateBulkInput,
	UpdateInput,
} from "@/features/transactions/actions/core";
import type { RateSource } from "@/shared/lib/exchange/constants";

export type ExistingTransaction = Pick<
	typeof transactions.$inferSelect,
	| "name"
	| "amount"
	| "purchaseDate"
	| "period"
	| "transactionType"
	| "condition"
	| "paymentMethod"
	| "categoryId"
	| "payerId"
	| "accountId"
	| "cardId"
	| "note"
	| "installmentCount"
	| "recurrenceCount"
	| "dueDate"
	| "boletoPaymentDate"
	| "isSettled"
	| "originCurrency"
	| "originAmount"
	| "exchangeRate"
	| "rateSource"
	| "rateDate"
>;

export type TransactionChanges = {
	name?: string;
	amount?: number;
	purchaseDate?: string;
	period?: string;
	transactionType?: "Despesa" | "Receita";
	condition?: UpdateInput["condition"];
	paymentMethod?: UpdateInput["paymentMethod"];
	categoryId?: string;
	payerId?: string;
	accountId?: string | null;
	cardId?: string | null;
	note?: string | null;
	installmentCount?: number;
	recurrenceCount?: number;
	dueDate?: string;
	boletoPaymentDate?: string;
	isSettled?: boolean;
	originCurrency?: string;
	originAmount?: number;
	exchangeRate?: number;
	rateSource?: RateSource;
	rateDate?: string;
};

const toDateOnly = (value: Date | null) =>
	value ? value.toISOString().slice(0, 10) : undefined;

const toPositiveNumber = (value: string | null) =>
	value === null ? null : Math.abs(Number(value));

/**
 * `updateTransactionAction` só mantém o sinal negativo em `Despesa`: editar a
 * perna de saída de uma transferência a transformaria em entrada.
 */
export function isEditableByTool(
	existing: Pick<ExistingTransaction, "transactionType">,
): boolean {
	return existing.transactionType !== "Transferência";
}

/**
 * As actions de edição gravam `campo ?? null`: o formulário do navegador sempre
 * manda tudo. O modelo manda só o que muda, então o resto vem da linha atual.
 *
 * `period` volta vazio quando a data ou o cartão mudam, para a fatura ser
 * recalculada em vez de manter o mês antigo.
 */
export function mergeTransactionUpdate(
	existing: ExistingTransaction,
	changes: TransactionChanges,
) {
	const movedInvoice =
		changes.purchaseDate !== undefined || changes.cardId !== undefined;
	const hasNewExchange = changes.exchangeRate !== undefined;
	// Valor novo sem cotação nova: preferir ausente e honesto a origem obsoleta.
	const keepsExchange = changes.amount === undefined || hasNewExchange;

	return {
		name: changes.name ?? existing.name,
		amount: changes.amount ?? Math.abs(Number(existing.amount)),
		purchaseDate:
			changes.purchaseDate ?? (toDateOnly(existing.purchaseDate) as string),
		period: changes.period ?? (movedInvoice ? undefined : existing.period),
		transactionType: (changes.transactionType ??
			existing.transactionType) as UpdateInput["transactionType"],
		condition: (changes.condition ??
			existing.condition) as UpdateInput["condition"],
		paymentMethod: (changes.paymentMethod ??
			existing.paymentMethod) as UpdateInput["paymentMethod"],
		categoryId: changes.categoryId ?? existing.categoryId,
		payerId: changes.payerId ?? existing.payerId,
		accountId:
			changes.accountId !== undefined ? changes.accountId : existing.accountId,
		cardId: changes.cardId !== undefined ? changes.cardId : existing.cardId,
		note: changes.note !== undefined ? changes.note : existing.note,
		installmentCount:
			changes.installmentCount ?? existing.installmentCount ?? undefined,
		recurrenceCount:
			changes.recurrenceCount ?? existing.recurrenceCount ?? undefined,
		dueDate: changes.dueDate ?? toDateOnly(existing.dueDate),
		boletoPaymentDate:
			changes.boletoPaymentDate ?? toDateOnly(existing.boletoPaymentDate),
		isSettled: changes.isSettled ?? existing.isSettled,
		isSplit: false,
		originCurrency: keepsExchange
			? (changes.originCurrency ?? existing.originCurrency)
			: null,
		originAmount: keepsExchange
			? (changes.originAmount ?? toPositiveNumber(existing.originAmount))
			: null,
		exchangeRate: keepsExchange
			? (changes.exchangeRate ?? toPositiveNumber(existing.exchangeRate))
			: null,
		rateSource: keepsExchange
			? (changes.rateSource ?? (existing.rateSource as RateSource | null))
			: null,
		rateDate: keepsExchange ? (changes.rateDate ?? existing.rateDate) : null,
	};
}

type SeriesChanges = Partial<
	Omit<UpdateBulkInput, "id" | "scope" | "note" | "categoryId">
> &
	Pick<UpdateBulkInput, "id" | "scope"> & {
		categoryId?: string;
		note?: string | null;
	};

/** Mesma proteção de `mergeTransactionUpdate`, para a edição de série. */
export function mergeSeriesUpdate(
	existing: ExistingTransaction,
	changes: SeriesChanges,
): UpdateBulkInput {
	return {
		...changes,
		name: changes.name ?? existing.name,
		categoryId: changes.categoryId ?? existing.categoryId,
		payerId: changes.payerId ?? existing.payerId,
		accountId:
			changes.accountId !== undefined ? changes.accountId : existing.accountId,
		cardId: changes.cardId !== undefined ? changes.cardId : existing.cardId,
		note: changes.note !== undefined ? changes.note : existing.note,
	};
}
