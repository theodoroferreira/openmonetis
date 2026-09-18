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
	PluggyError,
	parsePluggyDate,
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

const disconnectSchema = z.string().trim().uuid("ID inválido.");
const refreshSchema = z.string().trim().uuid("ID inválido.");

function handlePluggyActionError(
	error: unknown,
	actionName: string,
	defaultMessage = "Não foi possível processar a requisição no Pluggy.",
): ActionResponse {
	if (error instanceof PluggyError) {
		if (error.status === 401 || error.status === 403) {
			return {
				success: false,
				error:
					"Credenciais da integração inválidas ou expiradas. Verifique PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.",
			};
		}

		if (error.status === 404) {
			return {
				success: false,
				error:
					"Item não encontrado para esta aplicação. No Pluggy Dashboard, acesse sua aplicação, clique em 'Ir para Demo', abra o menu de três pontos do item e selecione 'Copiar Item ID'.",
			};
		}
	}

	console.error(`[${actionName}]`, error);
	return {
		success: false,
		error: defaultMessage,
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as {
		code?: string;
		cause?: { code?: string };
	};

	return candidate.code === "23505" || candidate.cause?.code === "23505";
}

/**
 * Vincula um item do Pluggy ao usuário atual.
 *
 * Valida o itemId contra a API antes de gravar: um identificador errado
 * falha aqui, em vez de virar uma linha inútil no banco.
 */
export async function connectPluggyItemAction(data: {
	itemId: string;
}): Promise<ActionResponse> {
	const parsed = connectSchema.safeParse(data);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const { itemId } = parsed.data;

	try {
		if (!isPluggyConfigured()) {
			return { success: false, error: "Integração não configurada." };
		}

		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;

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
			lastSyncedAt: parsePluggyDate(item.updatedAt),
		});

		revalidatePath("/settings");

		return { success: true, message: "Conexão vinculada com sucesso." };
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return {
				success: false,
				error: "Este item já está vinculado.",
			};
		}

		return handlePluggyActionError(
			error,
			"connectPluggyItemAction",
			"Não foi possível vincular o item. Tente novamente mais tarde.",
		);
	}
}

/** Desvincula um item. Só remove linhas do próprio usuário. */
export async function disconnectPluggyItemAction(
	id: string,
): Promise<ActionResponse> {
	const parsed = disconnectSchema.safeParse(id);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "ID inválido.",
		};
	}

	const parsedId = parsed.data;

	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;

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

/** Atualiza o status de um item buscando os dados mais recentes no Pluggy. */
export async function refreshPluggyItemAction(
	id: string,
): Promise<ActionResponse> {
	const parsed = refreshSchema.safeParse(id);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "ID inválido.",
		};
	}

	const parsedId = parsed.data;

	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		if (!isPluggyConfigured()) {
			return { success: false, error: "Integração não configurada." };
		}

		const userId = session.user.id;

		const currentItem = await db.query.pluggyItems.findFirst({
			where: and(eq(pluggyItems.id, parsedId), eq(pluggyItems.userId, userId)),
		});

		if (!currentItem) {
			return { success: false, error: "Conexão não encontrada." };
		}

		const item = await fetchPluggyItem(currentItem.pluggyItemId);

		await db
			.update(pluggyItems)
			.set({
				status: item.status,
				lastSyncedAt: parsePluggyDate(item.updatedAt),
				updatedAt: new Date(),
			})
			.where(and(eq(pluggyItems.id, parsedId), eq(pluggyItems.userId, userId)));

		revalidatePath("/settings");

		return { success: true, message: "Conexão atualizada com sucesso." };
	} catch (error) {
		return handlePluggyActionError(
			error,
			"refreshPluggyItemAction",
			"Não foi possível atualizar a conexão. Tente novamente mais tarde.",
		);
	}
}
