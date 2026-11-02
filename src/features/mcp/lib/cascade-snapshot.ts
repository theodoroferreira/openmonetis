import { and, eq, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

const MAX_SNAPSHOT_ROWS = 2000;

/** Linhas de lançamento que uma exclusão vai levar junto, para a auditoria. */
export async function snapshotTransactions(userId: string, condition: SQL) {
	const rows = await db
		.select()
		.from(transactions)
		.where(and(eq(transactions.userId, userId), condition))
		.limit(MAX_SNAPSHOT_ROWS + 1);

	return {
		transactions: rows.slice(0, MAX_SNAPSHOT_ROWS),
		truncated: rows.length > MAX_SNAPSHOT_ROWS,
	};
}
