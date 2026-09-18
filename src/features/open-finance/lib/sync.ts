import "server-only";

import { eq, sql } from "drizzle-orm";
import { pluggyAccounts, pluggyItems } from "@/db/schema";
import { mapPluggyAccountToRow } from "@/features/open-finance/lib/map-account";
import { db } from "@/shared/lib/db";
import {
	fetchPluggyItem,
	listAccounts,
	parsePluggyDate,
} from "@/shared/lib/pluggy/client";

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
