import { count, eq, inArray } from "drizzle-orm";
import { attachments, transactionAttachments } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { deleteS3Object } from "@/shared/lib/storage/presign";

/**
 * Limpa anexos órfãos do S3 após deletar transações. Chame APÓS o delete.
 *
 * Fica fora de arquivos `"use server"` de propósito: não checa autenticação e
 * apaga por IDs recebidos, então não pode virar endpoint chamável pelo cliente.
 */
export async function cleanupAttachmentsAfterTransactionDelete(
	attachmentData: Array<{ id: string; fileKey: string }>,
): Promise<void> {
	if (attachmentData.length === 0) return;

	const uniqueIds = [...new Set(attachmentData.map((a) => a.id))];

	const remaining = await db
		.select({
			attachmentId: transactionAttachments.attachmentId,
			total: count(),
		})
		.from(transactionAttachments)
		.where(inArray(transactionAttachments.attachmentId, uniqueIds))
		.groupBy(transactionAttachments.attachmentId);

	const remainingMap = new Map(remaining.map((r) => [r.attachmentId, r.total]));

	for (const att of attachmentData) {
		if (!remainingMap.has(att.id) || (remainingMap.get(att.id) ?? 0) === 0) {
			await deleteS3Object(att.fileKey);
			await db.delete(attachments).where(eq(attachments.id, att.id));
		}
	}
}
