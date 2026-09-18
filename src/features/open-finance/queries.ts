import { asc, desc, eq } from "drizzle-orm";
import { cards, financialAccounts, pluggyItems } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { loadLogoOptions } from "@/shared/lib/logo/options";

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

export interface LinkTargetOption {
	id: string;
	name: string;
	logo: string | null;
}

/**
 * Contas e cartões do usuário, para o seletor de vínculo (existente ou
 * conta-pai de um cartão novo) e para exibir o nome do destino já vinculado.
 */
export async function fetchLinkTargetOptions(userId: string): Promise<{
	accounts: LinkTargetOption[];
	cards: LinkTargetOption[];
	logoOptions: string[];
}> {
	const [accountRows, cardRows, logoOptions] = await Promise.all([
		db
			.select({
				id: financialAccounts.id,
				name: financialAccounts.name,
				logo: financialAccounts.logo,
			})
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId))
			.orderBy(asc(financialAccounts.name)),
		db
			.select({ id: cards.id, name: cards.name, logo: cards.logo })
			.from(cards)
			.where(eq(cards.userId, userId))
			.orderBy(asc(cards.name)),
		loadLogoOptions(),
	]);

	return { accounts: accountRows, cards: cardRows, logoOptions };
}
