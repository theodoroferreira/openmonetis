import { and, eq, inArray } from "drizzle-orm";
import { importCategoryMappings } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { normalizeOfxIdentityText } from "@/shared/lib/import/ofx-identity";
import type { PluggyTransaction } from "@/shared/lib/pluggy/schemas";

/**
 * Chave de descricao usada para casar com `import_category_mappings`.
 * NUNCA usa `transaction.categoryId` do Pluggy — a sugestao vem so do
 * historico de categorizacao do proprio usuario.
 */
export function buildTransactionDescriptionKey(
	transaction: PluggyTransaction,
): string {
	return normalizeOfxIdentityText(
		transaction.descriptionRaw ?? transaction.description,
	);
}

/** Consulta em lote os mapeamentos de categoria para uma pagina de transacoes. */
export async function fetchSuggestedCategoriesForPage(
	userId: string,
	transactions: PluggyTransaction[],
): Promise<Map<string, string>> {
	const keys = [
		...new Set(transactions.map(buildTransactionDescriptionKey)),
	].filter(Boolean);
	if (keys.length === 0) return new Map();

	const rows = await db
		.select({
			descriptionKey: importCategoryMappings.descriptionKey,
			categoryId: importCategoryMappings.categoryId,
		})
		.from(importCategoryMappings)
		.where(
			and(
				eq(importCategoryMappings.userId, userId),
				inArray(importCategoryMappings.descriptionKey, keys),
			),
		);

	return new Map(rows.map((row) => [row.descriptionKey, row.categoryId]));
}

/** Resolve o categoryId sugerido para uma transacao a partir do mapa da pagina. */
export function resolveSuggestedCategoryId(
	transaction: PluggyTransaction,
	suggestions: Map<string, string>,
): string | null {
	return suggestions.get(buildTransactionDescriptionKey(transaction)) ?? null;
}
