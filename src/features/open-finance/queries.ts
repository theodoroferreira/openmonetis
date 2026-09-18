import { asc, desc, eq } from "drizzle-orm";
import { pluggyItems } from "@/db/schema";
import { db } from "@/shared/lib/db";

export interface PluggyAccountRow {
	id: string;
	pluggyAccountId: string;
	type: string;
	subtype: string | null;
	name: string;
	number: string | null;
	balance: string | null;
	limit: string | null;
	availableLimit: string | null;
	statusVinculo: "pendente" | "vinculada" | "ignorada";
	accountId: string | null;
	cardId: string | null;
	lastSyncedAt: Date | null;
	lastSyncError: string | null;
}

export interface PluggyItemRow {
	id: string;
	pluggyItemId: string;
	connectorId: number | null;
	connectorName: string | null;
	status: string;
	lastSyncedAt: Date | null;
	createdAt: Date;
	accounts: PluggyAccountRow[];
}

/** Itens do usuário com as contas descobertas de cada um, para a aba Open Finance. */
export async function fetchPluggyItems(
	userId: string,
): Promise<PluggyItemRow[]> {
	const items = await db.query.pluggyItems.findMany({
		where: eq(pluggyItems.userId, userId),
		orderBy: desc(pluggyItems.createdAt),
		with: {
			accounts: {
				orderBy: (account) => asc(account.name),
			},
		},
	});

	return items.map((item) => ({
		id: item.id,
		pluggyItemId: item.pluggyItemId,
		connectorId: item.connectorId,
		connectorName: item.connectorName,
		status: item.status,
		lastSyncedAt: item.lastSyncedAt,
		createdAt: item.createdAt,
		accounts: item.accounts.map((account) => ({
			id: account.id,
			pluggyAccountId: account.pluggyAccountId,
			type: account.type,
			subtype: account.subtype,
			name: account.name,
			number: account.number,
			balance: account.balance,
			limit: account.limit,
			availableLimit: account.availableLimit,
			statusVinculo: account.statusVinculo,
			accountId: account.accountId,
			cardId: account.cardId,
			lastSyncedAt: account.lastSyncedAt,
			lastSyncError: account.lastSyncError,
		})),
	}));
}
