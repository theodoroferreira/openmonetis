import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { inboxItems, pluggyAccounts, pluggyItems } from "@/db/schema";
import { detectInvoicePaymentFlag } from "@/features/open-finance/lib/invoice-payment";
import { mapPluggyAccountToRow } from "@/features/open-finance/lib/map-account";
import { mapPluggyTransactionToInboxItem } from "@/features/open-finance/lib/map-transaction";
import {
	fetchSuggestedCategoriesForPage,
	resolveSuggestedCategoryId,
} from "@/features/open-finance/lib/suggest-category";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import {
	fetchPluggyItem,
	listAccounts,
	listTransactions,
	parsePluggyDate,
} from "@/shared/lib/pluggy/client";
import type { PluggyAccount } from "@/shared/lib/pluggy/schemas";

/** Sem cursor, a primeira carga de transacoes busca so os ultimos N dias. */
const INITIAL_TRANSACTION_SYNC_LOOKBACK_DAYS = 90;

const DEFAULT_CONNECTOR_NAME = "Pluggy";

function buildInitialDateFrom(): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - INITIAL_TRANSACTION_SYNC_LOOKBACK_DAYS);
	return date.toISOString().slice(0, 10);
}

/**
 * Descobre os itens do usuario, atualiza o status de cada um no Pluggy e
 * faz upsert das contas descobertas em `contas_pluggy`. Nunca escreve em
 * `contas` nem em `cartoes` — isso so acontece quando o usuario vincula
 * manualmente uma conta descoberta.
 */
export async function syncPluggyItemsAndAccounts(
	userId: string,
): Promise<void> {
	const items = await db.query.pluggyItems.findMany({
		where: eq(pluggyItems.userId, userId),
	});

	for (const item of items) {
		const remoteItem = await fetchPluggyItem(item.pluggyItemId);

		await db
			.update(pluggyItems)
			.set({
				status: remoteItem.status,
				lastSyncedAt: parsePluggyDate(remoteItem.updatedAt),
				updatedAt: new Date(),
			})
			.where(eq(pluggyItems.id, item.id));

		const remoteAccounts = await listAccounts(item.pluggyItemId);
		if (remoteAccounts.length === 0) continue;

		const rows = remoteAccounts.map((account) => ({
			userId,
			itemId: item.id,
			pluggyAccountId: account.id,
			...mapPluggyAccountToRow(account),
		}));

		// Saldo, limite e limite disponivel sao refrescados em toda conta ja
		// conhecida (inclusive pendente/ignorada); vinculo (status_vinculo,
		// conta_id, cartao_id) e cursor de transacoes nunca sao tocados aqui.
		await db
			.insert(pluggyAccounts)
			.values(rows)
			.onConflictDoUpdate({
				target: pluggyAccounts.pluggyAccountId,
				set: {
					type: sql`excluded.tipo`,
					subtype: sql`excluded.subtipo`,
					name: sql`excluded.nome`,
					number: sql`excluded.numero`,
					currency: sql`excluded.moeda`,
					balance: sql`excluded.saldo`,
					balanceUpdatedAt: sql`excluded.saldo_atualizado_em`,
					limit: sql`excluded.limite`,
					availableLimit: sql`excluded.limite_disponivel`,
					closingDay: sql`excluded.dt_fechamento`,
					dueDay: sql`excluded.dt_vencimento`,
					brand: sql`excluded.bandeira`,
					updatedAt: new Date(),
				},
			});
	}
}

/**
 * Sincroniza transacoes de uma unica conta vinculada, paginando pelo cursor
 * do Pluggy ate `next` vir nulo. `last_transaction_cursor` so avanca depois
 * do insert de cada pagina ter sucesso, para que uma falha no meio da
 * paginacao possa ser retomada de onde parou.
 */
async function syncAccountTransactions(
	account: {
		id: string;
		pluggyAccountId: string;
		type: string;
		lastTransactionCursor: string | null;
	},
	userId: string,
	connectorName: string,
): Promise<void> {
	let cursor = account.lastTransactionCursor ?? undefined;
	let isFirstRequest = true;
	let hasMore = true;

	while (hasMore) {
		const page = await listTransactions({
			accountId: account.pluggyAccountId,
			after: cursor,
			dateFrom:
				isFirstRequest && !account.lastTransactionCursor
					? buildInitialDateFrom()
					: undefined,
		});
		isFirstRequest = false;

		if (page.results.length > 0) {
			const suggestions = await fetchSuggestedCategoriesForPage(
				userId,
				page.results,
			);

			const rows = page.results.map((transaction) => {
				const mapped = mapPluggyTransactionToInboxItem(transaction, {
					accountType: account.type as PluggyAccount["type"],
					connectorName,
				});

				return {
					userId,
					sourceApp: mapped.sourceApp,
					sourceAppName: mapped.sourceAppName,
					originalText: mapped.originalText,
					notificationTimestamp: mapped.notificationTimestamp,
					pluggyTransactionId: mapped.pluggyTransactionId,
					pluggyAccountId: account.id,
					pluggyStatus: mapped.pluggyStatus,
					pluggyFlag: detectInvoicePaymentFlag(
						transaction,
						account.type as PluggyAccount["type"],
					),
					parsedName: mapped.parsedName,
					parsedAmount: mapped.parsedAmount,
					parsedTransactionType: mapped.parsedTransactionType,
					parsedDate: mapped.parsedDate,
					parsedPeriod: mapped.parsedPeriod,
					parsedPaymentMethod: mapped.parsedPaymentMethod,
					parsedCategoryId: resolveSuggestedCategoryId(
						transaction,
						suggestions,
					),
					parsedInstallmentCount: mapped.parsedInstallmentCount,
					parsedCurrentInstallment: mapped.parsedCurrentInstallment,
				};
			});

			// Conflito so atualiza pre-lancamentos ainda `pending`; itens ja
			// processed/discarded ficam intocados (setWhere). O par
			// (target + targetWhere) precisa espelhar exatamente o predicado do
			// indice unico parcial em `src/db/schema.ts`.
			await db
				.insert(inboxItems)
				.values(rows)
				.onConflictDoUpdate({
					target: [inboxItems.userId, inboxItems.pluggyTransactionId],
					targetWhere: sql`pluggy_transaction_id IS NOT NULL`,
					setWhere: eq(inboxItems.status, "pending"),
					set: {
						parsedAmount: sql`excluded.parsed_amount`,
						parsedDate: sql`excluded.parsed_date`,
						parsedName: sql`excluded.parsed_name`,
						pluggyStatus: sql`excluded.pluggy_status`,
						updatedAt: new Date(),
					},
				});
		}

		hasMore = page.after !== null;

		if (page.after) {
			await db
				.update(pluggyAccounts)
				.set({ lastTransactionCursor: page.after, updatedAt: new Date() })
				.where(eq(pluggyAccounts.id, account.id));
			cursor = page.after;
		}
	}
}

/**
 * Sincroniza as transacoes de todas as contas vinculadas do usuario. Contas
 * `pendente`/`ignorada` nunca sincronizam transacoes — so o saldo delas e
 * refrescado por `syncPluggyItemsAndAccounts`.
 */
export async function syncPluggyAccountTransactions(
	userId: string,
): Promise<void> {
	const accounts = await db.query.pluggyAccounts.findMany({
		where: and(
			eq(pluggyAccounts.userId, userId),
			eq(pluggyAccounts.statusVinculo, "vinculada"),
		),
		with: { item: true },
	});

	for (const account of accounts) {
		await syncAccountTransactions(
			account,
			userId,
			account.item.connectorName ?? DEFAULT_CONNECTOR_NAME,
		);
	}

	revalidateForEntity("inbox", userId);
}
