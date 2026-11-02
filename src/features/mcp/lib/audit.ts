import { mcpAuditLog } from "@/db/schema";
import { db } from "@/shared/lib/db";

type AuditResult = "success" | "error" | "dry_run";

export type AuditEntry = {
	userId: string;
	tokenId: string | null;
	tool: string;
	arguments: unknown;
	result: AuditResult;
	message: string | null;
	affectedIds?: string[];
	snapshot?: unknown;
};

/**
 * Falha ao auditar não desfaz a escrita, que já aconteceu: registra no log do
 * servidor e deixa o resultado da ferramenta seguir para o cliente.
 */
export async function writeAuditEntry(entry: AuditEntry): Promise<void> {
	try {
		await db.insert(mcpAuditLog).values({
			userId: entry.userId,
			tokenId: entry.tokenId,
			tool: entry.tool,
			arguments: entry.arguments ?? null,
			result: entry.result,
			message: entry.message?.slice(0, 500) ?? null,
			affectedIds: entry.affectedIds ?? null,
			snapshot: entry.snapshot ?? null,
		});
	} catch (error) {
		console.error("[MCP] Falha ao gravar auditoria:", entry.tool, error);
	}
}
