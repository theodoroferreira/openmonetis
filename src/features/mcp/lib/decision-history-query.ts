import {
	and,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	ne,
	notLike,
	or,
} from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	inboxItems,
	payers,
	transactions,
} from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { parseLocalDateString } from "@/shared/utils/date";
import {
	groupDecisionHistory,
	type HistoryInboxRow,
	resolveHistoryWindow,
} from "./decision-history";

const MAX_GROUPS = 300;

/** Consulta direta, sem `"use cache"`: precisa enxergar a escrita mais recente. */
export async function fetchDecisionHistory(
	userId: string,
	months: number,
	before: string | undefined,
) {
	const window = resolveHistoryWindow(months, before, new Date());

	const [inboxRows, transactionRows] = await Promise.all([
		db
			.select({ name: inboxItems.parsedName, status: inboxItems.status })
			.from(inboxItems)
			.where(
				and(
					eq(inboxItems.userId, userId),
					inArray(inboxItems.status, ["processed", "discarded"]),
					gte(
						inboxItems.notificationTimestamp,
						new Date(`${window.start}T00:00:00.000Z`),
					),
					lt(
						inboxItems.notificationTimestamp,
						new Date(`${window.end}T00:00:00.000Z`),
					),
				),
			),
		db
			.select({
				name: transactions.name,
				amount: transactions.amount,
				categoryId: transactions.categoryId,
				categoryName: categories.name,
				accountId: transactions.accountId,
				accountName: financialAccounts.name,
				cardId: transactions.cardId,
				cardName: cards.name,
				paymentMethod: transactions.paymentMethod,
				payerId: transactions.payerId,
				payerName: payers.name,
				condition: transactions.condition,
				purchaseDate: transactions.purchaseDate,
			})
			.from(transactions)
			.leftJoin(categories, eq(transactions.categoryId, categories.id))
			.leftJoin(
				financialAccounts,
				eq(transactions.accountId, financialAccounts.id),
			)
			.leftJoin(cards, eq(transactions.cardId, cards.id))
			.leftJoin(payers, eq(transactions.payerId, payers.id))
			.where(
				and(
					eq(transactions.userId, userId),
					gte(transactions.purchaseDate, parseLocalDateString(window.start)),
					lt(transactions.purchaseDate, parseLocalDateString(window.end)),
					ne(transactions.transactionType, "Transferência"),
					or(
						isNull(transactions.note),
						notLike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`),
					),
				),
			),
	]);

	const groups = groupDecisionHistory(
		inboxRows as HistoryInboxRow[],
		transactionRows,
	);

	return {
		window,
		totalGroups: groups.length,
		truncated: groups.length > MAX_GROUPS,
		groups: groups.slice(0, MAX_GROUPS),
	};
}
