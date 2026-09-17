import { desc, eq } from "drizzle-orm";
import { apiTokens, pluggyItems } from "@/db/schema";
import { db, schema } from "@/shared/lib/db";
import { isPluggyConfigured } from "@/shared/lib/pluggy/client";

interface UserPreferences {
	statementNoteAsColumn: boolean;
	transactionsColumnOrder: string[] | null;
	attachmentMaxSizeMb: number;
	showTransactionSummary: boolean;
	groupTransactionsByDate: boolean;
	hideAnticipatedInstallments: boolean;
}

interface ApiToken {
	id: string;
	name: string;
	tokenPrefix: string;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	revokedAt: Date | null;
}

export interface PluggyItemRow {
	id: string;
	pluggyItemId: string;
	connectorId: number | null;
	connectorName: string | null;
	status: string;
	lastSyncedAt: Date | null;
	createdAt: Date;
}

async function fetchAuthProvider(userId: string): Promise<string> {
	const userAccount = await db.query.account.findFirst({
		where: eq(schema.account.userId, userId),
	});
	return userAccount?.providerId || "credential";
}

export async function fetchUserPreferences(
	userId: string,
): Promise<UserPreferences | null> {
	const result = await db
		.select({
			statementNoteAsColumn: schema.userPreferences.statementNoteAsColumn,
			transactionsColumnOrder: schema.userPreferences.transactionsColumnOrder,
			attachmentMaxSizeMb: schema.userPreferences.attachmentMaxSizeMb,
			showTransactionSummary: schema.userPreferences.showTransactionSummary,
			groupTransactionsByDate: schema.userPreferences.groupTransactionsByDate,
			hideAnticipatedInstallments:
				schema.userPreferences.hideAnticipatedInstallments,
		})
		.from(schema.userPreferences)
		.where(eq(schema.userPreferences.userId, userId))
		.limit(1);

	if (!result[0]) return null;

	return result[0];
}

async function fetchApiTokens(userId: string): Promise<ApiToken[]> {
	return db
		.select({
			id: apiTokens.id,
			name: apiTokens.name,
			tokenPrefix: apiTokens.tokenPrefix,
			lastUsedAt: apiTokens.lastUsedAt,
			lastUsedIp: apiTokens.lastUsedIp,
			createdAt: apiTokens.createdAt,
			expiresAt: apiTokens.expiresAt,
			revokedAt: apiTokens.revokedAt,
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.orderBy(desc(apiTokens.createdAt));
}

async function fetchPluggyItems(userId: string): Promise<PluggyItemRow[]> {
	return db
		.select({
			id: pluggyItems.id,
			pluggyItemId: pluggyItems.pluggyItemId,
			connectorId: pluggyItems.connectorId,
			connectorName: pluggyItems.connectorName,
			status: pluggyItems.status,
			lastSyncedAt: pluggyItems.lastSyncedAt,
			createdAt: pluggyItems.createdAt,
		})
		.from(pluggyItems)
		.where(eq(pluggyItems.userId, userId))
		.orderBy(desc(pluggyItems.createdAt));
}

export async function fetchSettingsPageData(userId: string) {
	const pluggyEnabled = isPluggyConfigured();

	const [authProvider, userPreferences, userApiTokens, userPluggyItems] =
		await Promise.all([
			fetchAuthProvider(userId),
			fetchUserPreferences(userId),
			fetchApiTokens(userId),
			pluggyEnabled ? fetchPluggyItems(userId) : Promise.resolve([]),
		]);

	return {
		authProvider,
		userPreferences,
		userApiTokens,
		pluggyEnabled,
		pluggyItems: userPluggyItems,
	};
}
