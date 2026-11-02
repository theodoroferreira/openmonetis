import { and, eq, inArray } from "drizzle-orm";
import { cards, inboxItems, pluggyAccounts, transactions } from "@/db/schema";
import {
	createTransactionAction,
	deleteTransactionAction,
} from "@/features/transactions/actions";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import { getExchangeRate } from "@/shared/lib/exchange/get-rate";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import type { ActionResult } from "@/shared/lib/types/actions";
import {
	type ApprovalContext,
	type ApprovalOverrides,
	type ApprovalRefusalCode,
	findExchangeLookup,
	mapInboxItemToTransaction,
} from "./inbox-to-transaction";

export type ApprovalRequest = { id: string; overrides?: ApprovalOverrides };

export type ApprovalOutcome =
	| { id: string; status: "created"; transactionId: string }
	| {
			id: string;
			status: "would_create";
			currentStatus: string;
			transaction: unknown;
	  }
	| { id: string; status: "refused"; code: ApprovalRefusalCode; reason: string }
	| { id: string; status: "not_found" }
	| { id: string; status: "already_decided"; currentStatus: string }
	| { id: string; status: "failed"; error: string };

export async function fetchPluggyLinks(
	userId: string,
	pluggyAccountIds: Array<string | null>,
): Promise<Map<string, { accountId: string | null; cardId: string | null }>> {
	const ids = [
		...new Set(pluggyAccountIds.filter((id): id is string => Boolean(id))),
	];
	if (ids.length === 0) return new Map();

	const rows = await db
		.select({
			id: pluggyAccounts.id,
			accountId: pluggyAccounts.accountId,
			cardId: pluggyAccounts.cardId,
		})
		.from(pluggyAccounts)
		.where(
			and(eq(pluggyAccounts.userId, userId), inArray(pluggyAccounts.id, ids)),
		);

	return new Map(
		rows.map((row) => [
			row.id,
			{ accountId: row.accountId, cardId: row.cardId },
		]),
	);
}

async function fetchCardCycles(
	userId: string,
): Promise<ApprovalContext["cards"]> {
	const rows = await db
		.select({
			id: cards.id,
			closingDay: cards.closingDay,
			dueDay: cards.dueDay,
		})
		.from(cards)
		.where(eq(cards.userId, userId));

	return new Map(
		rows.map((row) => [
			row.id,
			{ closingDay: row.closingDay, dueDay: row.dueDay },
		]),
	);
}

async function resolveExchange(
	lookup: { currency: string; date: string } | null,
): Promise<ApprovalContext["exchange"]> {
	if (!lookup) return null;

	const rate = await getExchangeRate(lookup.currency, lookup.date);

	return rate
		? { rate: rate.taxa, source: rate.fonte, rateDate: rate.dataCotacao }
		: null;
}

/** O `WHERE status = 'pending'` garante que só uma chamada concorrente vence. */
async function claimItem(userId: string, id: string): Promise<boolean> {
	const now = new Date();
	const claimed = await db
		.update(inboxItems)
		.set({ status: "processed", processedAt: now, updatedAt: now })
		.where(
			and(
				eq(inboxItems.id, id),
				eq(inboxItems.userId, userId),
				eq(inboxItems.status, "pending"),
			),
		)
		.returning({ id: inboxItems.id });

	return claimed.length > 0;
}

async function releaseItem(userId: string, id: string): Promise<void> {
	await db
		.update(inboxItems)
		.set({ status: "pending", processedAt: null, updatedAt: new Date() })
		.where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));
}

/**
 * Aprova itens da inbox um a um, com resultado individual. `dryRun` não muda
 * nada e também aceita itens já decididos, para o teste retroativo.
 */
export async function approveInboxItems(
	userId: string,
	requests: ApprovalRequest[],
	dryRun: boolean,
): Promise<ApprovalOutcome[]> {
	const rows = await db
		.select()
		.from(inboxItems)
		.where(
			and(
				eq(inboxItems.userId, userId),
				inArray(
					inboxItems.id,
					requests.map((request) => request.id),
				),
			),
		);

	const itemsById = new Map(rows.map((row) => [row.id, row]));
	const [links, cardCycles, adminPayerId] = await Promise.all([
		fetchPluggyLinks(
			userId,
			rows.map((row) => row.pluggyAccountId),
		),
		fetchCardCycles(userId),
		getAdminPayerId(userId),
	]);

	const outcomes: ApprovalOutcome[] = [];

	for (const { id, overrides } of requests) {
		const item = itemsById.get(id);

		if (!item) {
			outcomes.push({ id, status: "not_found" });
			continue;
		}

		if (!dryRun && item.status !== "pending") {
			outcomes.push({
				id,
				status: "already_decided",
				currentStatus: item.status,
			});
			continue;
		}

		const link = item.pluggyAccountId
			? links.get(item.pluggyAccountId)
			: undefined;
		const mapping = mapInboxItemToTransaction(
			item,
			{
				adminPayerId,
				linkedAccountId: link?.accountId ?? null,
				linkedCardId: link?.cardId ?? null,
				cards: cardCycles,
				exchange: await resolveExchange(findExchangeLookup(item, overrides)),
			},
			overrides,
		);

		if (!mapping.ok) {
			outcomes.push({
				id,
				status: "refused",
				code: mapping.code,
				reason: mapping.reason,
			});
			continue;
		}

		if (dryRun) {
			outcomes.push({
				id,
				status: "would_create",
				currentStatus: item.status,
				transaction: mapping.transaction,
			});
			continue;
		}

		if (!(await claimItem(userId, id))) {
			outcomes.push({
				id,
				status: "already_decided",
				currentStatus: "processed",
			});
			continue;
		}

		try {
			const result = await createTransactionAction(mapping.transaction);
			const transactionId = result.success ? result.data?.ids[0] : undefined;

			if (!transactionId) {
				await releaseItem(userId, id);
				outcomes.push({
					id,
					status: "failed",
					error: result.success ? "Lançamento não foi criado." : result.error,
				});
				continue;
			}

			await db
				.update(inboxItems)
				.set({ transactionId, updatedAt: new Date() })
				.where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));

			outcomes.push({ id, status: "created", transactionId });
		} catch (error) {
			await releaseItem(userId, id);
			throw error;
		}
	}

	if (!dryRun) {
		revalidateForEntity("inbox", userId);
	}

	return outcomes;
}

/**
 * Apaga o lançamento criado pela aprovação e devolve o item para `pending`.
 * Só alcança aprovações que gravaram `lancamento_id`, ou seja, as do bot.
 */
export async function undoInboxApproval(
	userId: string,
	id: string,
): Promise<ActionResult<{ snapshot: unknown }>> {
	const [item] = await db
		.select()
		.from(inboxItems)
		.where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
		.limit(1);

	if (!item) {
		return { success: false, error: "Item não encontrado." };
	}

	if (item.status !== "processed" || !item.transactionId) {
		return {
			success: false,
			error: "Este item não tem aprovação para desfazer.",
		};
	}

	const [transaction] = await db
		.select()
		.from(transactions)
		.where(
			and(
				eq(transactions.id, item.transactionId),
				eq(transactions.userId, userId),
			),
		)
		.limit(1);

	const deleted = await deleteTransactionAction({ id: item.transactionId });

	if (!deleted.success) {
		return deleted;
	}

	await db
		.update(inboxItems)
		.set({
			status: "pending",
			processedAt: null,
			transactionId: null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(inboxItems.id, id),
				eq(inboxItems.userId, userId),
				eq(inboxItems.status, "processed"),
			),
		);

	revalidateForEntity("inbox", userId);

	return {
		success: true,
		message: "Aprovação desfeita: o item voltou para pendentes.",
		data: { snapshot: transaction ?? null },
	};
}

/** Itens aprovados pelo bot que ainda podem ser desfeitos. */
export async function fetchUndoableItems(userId: string, ids: string[]) {
	if (ids.length === 0) return [];

	const rows = await db
		.select({
			id: inboxItems.id,
			name: inboxItems.parsedName,
			amount: inboxItems.parsedAmount,
			transactionId: inboxItems.transactionId,
		})
		.from(inboxItems)
		.where(
			and(
				eq(inboxItems.userId, userId),
				inArray(inboxItems.id, ids),
				eq(inboxItems.status, "processed"),
			),
		);

	return rows.filter((row) => row.transactionId !== null);
}
