import { desc, eq } from "drizzle-orm";
import { pluggyItems } from "@/db/schema";
import { db } from "@/shared/lib/db";

export interface PluggyItemRow {
	id: string;
	pluggyItemId: string;
	connectorId: number | null;
	connectorName: string | null;
	status: string;
	lastSyncedAt: Date | null;
	createdAt: Date;
}

export async function fetchPluggyItems(
	userId: string,
): Promise<PluggyItemRow[]> {
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
