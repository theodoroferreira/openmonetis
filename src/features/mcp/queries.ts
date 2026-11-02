import { desc, eq } from "drizzle-orm";
import { mcpAuditLog } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { fetchUndoableItems } from "./lib/inbox-approval";

const AUDIT_LIMIT = 30;
const APPROVAL_TOOL = "approve_inbox_items";

export type AutomationAuditEntry = {
	id: string;
	tool: string;
	result: "success" | "error" | "dry_run";
	message: string | null;
	createdAt: Date;
	undoableItems: { id: string; name: string | null; amount: string | null }[];
};

/** Auditoria recente, com os itens de cada aprovação que ainda podem ser desfeitos. */
export async function fetchAutomationData(userId: string): Promise<{
	auditEntries: AutomationAuditEntry[];
}> {
	const rows = await db
		.select({
			id: mcpAuditLog.id,
			tool: mcpAuditLog.tool,
			result: mcpAuditLog.result,
			message: mcpAuditLog.message,
			affectedIds: mcpAuditLog.affectedIds,
			createdAt: mcpAuditLog.createdAt,
		})
		.from(mcpAuditLog)
		.where(eq(mcpAuditLog.userId, userId))
		.orderBy(desc(mcpAuditLog.createdAt))
		.limit(AUDIT_LIMIT);

	const approvedIds = rows
		.filter((row) => row.tool === APPROVAL_TOOL)
		.flatMap((row) => row.affectedIds ?? []);
	const undoable = new Map(
		(await fetchUndoableItems(userId, approvedIds)).map((item) => [
			item.id,
			item,
		]),
	);

	return {
		auditEntries: rows.map(({ affectedIds, ...row }) => ({
			...row,
			undoableItems:
				row.tool === APPROVAL_TOOL
					? (affectedIds ?? []).flatMap((id) => {
							const item = undoable.get(id);
							return item
								? [{ id: item.id, name: item.name, amount: item.amount }]
								: [];
						})
					: [],
		})),
	};
}
