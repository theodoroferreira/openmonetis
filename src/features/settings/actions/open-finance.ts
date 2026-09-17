"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pluggyItems } from "@/db/schema";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	fetchPluggyItem,
	isPluggyConfigured,
} from "@/shared/lib/pluggy/client";

type ActionResponse<T = void> = {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
};

const connectSchema = z.object({
	itemId: z
		.string()
		.trim()
		.uuid("O itemId deve ser um UUID válido, copiado do Pluggy Dashboard."),
});

/**
 * Vincula um item do Pluggy ao usuário atual.
 *
 * Valida o itemId contra a API antes de gravar: um identificador errado
 * falha aqui, em vez de virar uma linha inútil no banco.
 */
export async function connectPluggyItemAction(data: {
	itemId: string;
}): Promise<ActionResponse> {
	try {
		if (!isPluggyConfigured()) {
			return { success: false, error: "Integração não configurada." };
		}

		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;
		const { itemId } = connectSchema.parse(data);

		const existing = await db.query.pluggyItems.findFirst({
			where: and(
				eq(pluggyItems.userId, userId),
				eq(pluggyItems.pluggyItemId, itemId),
			),
		});

		if (existing) {
			return { success: false, error: "Este item já está vinculado." };
		}

		const item = await fetchPluggyItem(itemId);

		await db.insert(pluggyItems).values({
			userId,
			pluggyItemId: item.id,
			connectorId: item.connector.id,
			connectorName: item.connector.name,
			status: item.status,
		});

		revalidatePath("/settings");

		return { success: true, message: "Conexão vinculada com sucesso." };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		console.error("[connectPluggyItemAction]", error);
		return {
			success: false,
			error: "Não foi possível vincular o item. Verifique o itemId.",
		};
	}
}

/** Desvincula um item. Só remove linhas do próprio usuário. */
export async function disconnectPluggyItemAction(
	id: string,
): Promise<ActionResponse> {
	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;
		const parsedId = z.string().uuid().parse(id);

		const deleted = await db
			.delete(pluggyItems)
			.where(and(eq(pluggyItems.id, parsedId), eq(pluggyItems.userId, userId)))
			.returning({ id: pluggyItems.id });

		if (deleted.length === 0) {
			return { success: false, error: "Conexão não encontrada." };
		}

		revalidatePath("/settings");

		return { success: true, message: "Conexão removida." };
	} catch (error) {
		console.error("[disconnectPluggyItemAction]", error);
		return { success: false, error: "Não foi possível remover a conexão." };
	}
}
