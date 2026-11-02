import { and, eq, inArray } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

type TransferCandidate = {
	transactionType: string;
	transferId: string | null;
};

/** Separa as transferências pedidas, sem acessar o banco. */
export function findTransferLinks(rows: TransferCandidate[]): {
	transferIds: string[];
	hasUnlinkedTransfer: boolean;
} {
	const transfers = rows.filter(
		(row) => row.transactionType === "Transferência",
	);

	return {
		transferIds: [
			...new Set(
				transfers.flatMap((row) => (row.transferId ? [row.transferId] : [])),
			),
		],
		hasUnlinkedTransfer: transfers.some((row) => !row.transferId),
	};
}

export type TransferExpansion =
	| { ok: true; ids: string[]; includesTransfer: boolean }
	| { ok: false; error: string };

/**
 * Transferência são dois lançamentos: apagar só um deixa dinheiro aparecendo
 * ou sumindo nos saldos. Completa os IDs com a outra perna de cada uma.
 */
export async function expandTransferLegs(
	userId: string,
	ids: string[],
): Promise<TransferExpansion> {
	const rows = await db
		.select({
			transactionType: transactions.transactionType,
			transferId: transactions.transferId,
		})
		.from(transactions)
		.where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));

	const { transferIds, hasUnlinkedTransfer } = findTransferLinks(rows);

	if (hasUnlinkedTransfer) {
		return {
			ok: false,
			error:
				"Transferência sem vínculo com a outra perna: exclua pelo navegador, conferindo as duas contas.",
		};
	}

	if (transferIds.length === 0) {
		return { ok: true, ids, includesTransfer: false };
	}

	const legs = await db
		.select({ id: transactions.id })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				inArray(transactions.transferId, transferIds),
			),
		);

	return {
		ok: true,
		ids: [...new Set([...ids, ...legs.map((leg) => leg.id)])],
		includesTransfer: true,
	};
}
