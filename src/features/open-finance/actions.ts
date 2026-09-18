"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	cards,
	financialAccounts,
	pluggyAccounts,
	pluggyItems,
} from "@/db/schema";
import {
	type SyncAccountsResult,
	syncPluggyAccountTransactions,
	syncPluggyItemsAndAccounts,
} from "@/features/open-finance/lib/sync";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	fetchPluggyItem,
	isPluggyConfigured,
	PluggyError,
	parsePluggyDate,
} from "@/shared/lib/pluggy/client";
import {
	dayOfMonthSchema,
	noteSchema,
	requiredDecimalSchema,
	uuidSchema,
} from "@/shared/lib/schemas/common";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { normalizeFilePath } from "@/shared/utils/string";

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

function handlePluggyActionError<T = void>(
	error: unknown,
	actionName: string,
	defaultMessage = "Não foi possível processar a requisição no Pluggy.",
): ActionResponse<T> {
	if (error instanceof z.ZodError) {
		return {
			success: false,
			error: error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

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

/**
 * Executa o ciclo completo de sincronização (items/contas, depois transações
 * das contas vinculadas) para o usuário da sessão.
 */
export async function syncPluggyNowAction(): Promise<
	ActionResponse<SyncAccountsResult>
> {
	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		if (!isPluggyConfigured()) {
			return { success: false, error: "Integração não configurada." };
		}

		const userId = session.user.id;

		await syncPluggyItemsAndAccounts(userId);
		const result = await syncPluggyAccountTransactions(userId);

		revalidatePath("/settings");

		return {
			success: true,
			message: "Sincronização concluída.",
			data: result,
		};
	} catch (error) {
		return handlePluggyActionError(
			error,
			"syncPluggyNowAction",
			"Não foi possível sincronizar agora. Tente novamente mais tarde.",
		);
	}
}

const newAccountTargetSchema = z.object({
	mode: z.literal("create_account"),
	name: z
		.string({ message: "Informe o nome da conta." })
		.trim()
		.min(1, "Informe o nome da conta."),
	accountType: z
		.string({ message: "Informe o tipo da conta." })
		.trim()
		.min(1, "Informe o tipo da conta."),
	status: z
		.string({ message: "Informe o status da conta." })
		.trim()
		.min(1, "Informe o status da conta."),
	logo: z
		.string({ message: "Selecione um logo." })
		.trim()
		.min(1, "Selecione um logo."),
	note: noteSchema,
});

const newCardTargetSchema = z.object({
	mode: z.literal("create_card"),
	name: z
		.string({ message: "Informe o nome do cartão." })
		.trim()
		.min(1, "Informe o nome do cartão."),
	brand: z
		.string({ message: "Informe a bandeira." })
		.trim()
		.min(1, "Informe a bandeira."),
	status: z
		.string({ message: "Informe o status do cartão." })
		.trim()
		.min(1, "Informe o status do cartão."),
	closingDay: dayOfMonthSchema,
	dueDay: dayOfMonthSchema,
	limit: requiredDecimalSchema("limite"),
	logo: z
		.string({ message: "Selecione um logo." })
		.trim()
		.min(1, "Selecione um logo."),
	note: noteSchema,
	// A conta-pai é sempre exigida explicitamente aqui — nunca inferida.
	accountId: uuidSchema("Conta"),
});

const linkPluggyAccountSchema = z.object({
	pluggyAccountId: uuidSchema("Conta do Pluggy"),
	target: z.discriminatedUnion("mode", [
		z.object({
			mode: z.literal("existing_account"),
			accountId: uuidSchema("Conta"),
		}),
		z.object({
			mode: z.literal("existing_card"),
			cardId: uuidSchema("Cartão"),
		}),
		newAccountTargetSchema,
		newCardTargetSchema,
	]),
});

export type LinkPluggyAccountInput = z.infer<typeof linkPluggyAccountSchema>;

/**
 * Vincula uma conta descoberta do Pluggy a uma conta/cartão existente ou a um
 * destino novo. A invariante tipo↔destino (BANK→conta, CREDIT→cartão) é
 * revalidada aqui, não só no CHECK do banco — uma conta CREDIT nunca aceita
 * um destino de conta bancária, e vice-versa.
 */
export async function linkPluggyAccountAction(
	input: LinkPluggyAccountInput,
): Promise<ActionResponse> {
	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;
		const data = linkPluggyAccountSchema.parse(input);

		const pluggyAccount = await db.query.pluggyAccounts.findFirst({
			where: and(
				eq(pluggyAccounts.id, data.pluggyAccountId),
				eq(pluggyAccounts.userId, userId),
			),
		});

		if (!pluggyAccount) {
			return { success: false, error: "Conta do Pluggy não encontrada." };
		}

		const isCreditAccount = pluggyAccount.type === "CREDIT";
		const targetsCard =
			data.target.mode === "existing_card" ||
			data.target.mode === "create_card";

		if (isCreditAccount !== targetsCard) {
			return {
				success: false,
				error: isCreditAccount
					? "Esta é uma conta de cartão de crédito: escolha um cartão como destino."
					: "Esta é uma conta bancária: escolha uma conta como destino.",
			};
		}

		let accountId: string | null = null;
		let cardId: string | null = null;

		if (data.target.mode === "existing_account") {
			const account = await db.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.target.accountId),
					eq(financialAccounts.userId, userId),
				),
			});

			if (!account) {
				return { success: false, error: "Conta não encontrada." };
			}

			accountId = account.id;
		} else if (data.target.mode === "existing_card") {
			const card = await db.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.target.cardId), eq(cards.userId, userId)),
			});

			if (!card) {
				return { success: false, error: "Cartão não encontrado." };
			}

			cardId = card.id;
		} else if (data.target.mode === "create_account") {
			const [created] = await db
				.insert(financialAccounts)
				.values({
					name: data.target.name,
					accountType: data.target.accountType,
					status: data.target.status,
					note: data.target.note ?? null,
					logo: normalizeFilePath(data.target.logo),
					initialBalance: formatDecimalForDbRequired(0),
					excludeFromBalance: false,
					excludeInitialBalanceFromIncome: false,
					userId,
				})
				.returning({ id: financialAccounts.id });

			if (!created) {
				throw new Error("Não foi possível criar a conta.");
			}

			accountId = created.id;
			revalidateForEntity("accounts", userId);
		} else {
			const parentAccount = await db.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.target.accountId),
					eq(financialAccounts.userId, userId),
				),
			});

			if (!parentAccount) {
				return { success: false, error: "Conta-pai não encontrada." };
			}

			const [created] = await db
				.insert(cards)
				.values({
					name: data.target.name,
					brand: data.target.brand,
					status: data.target.status,
					closingDay: data.target.closingDay,
					dueDay: data.target.dueDay,
					note: data.target.note ?? null,
					limit: formatDecimalForDbRequired(data.target.limit),
					logo: normalizeFilePath(data.target.logo),
					accountId: parentAccount.id,
					userId,
				})
				.returning({ id: cards.id });

			if (!created) {
				throw new Error("Não foi possível criar o cartão.");
			}

			cardId = created.id;
			revalidateForEntity("cards", userId);
		}

		await db
			.update(pluggyAccounts)
			.set({
				statusVinculo: "vinculada",
				accountId,
				cardId,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(pluggyAccounts.id, pluggyAccount.id),
					eq(pluggyAccounts.userId, userId),
				),
			);

		revalidatePath("/settings");

		return { success: true, message: "Conta vinculada com sucesso." };
	} catch (error) {
		return handlePluggyActionError(
			error,
			"linkPluggyAccountAction",
			"Não foi possível vincular a conta. Tente novamente mais tarde.",
		);
	}
}

const ignorePluggyAccountSchema = uuidSchema("Conta do Pluggy");

/**
 * Alterna o vínculo de uma conta descoberta: de `pendente` vira `ignorada`;
 * de `vinculada` ou `ignorada` volta para `pendente` (desfazendo o vínculo,
 * quando houver). Sair de `vinculada` sempre zera `last_transaction_cursor` —
 * ao revincular, a conta refaz a carga inicial de 90 dias.
 */
export async function ignorePluggyAccountAction(
	id: string,
): Promise<ActionResponse> {
	try {
		const session = await getOptionalUserSession();

		if (!session?.user?.id) {
			return { success: false, error: "Não autenticado" };
		}

		const userId = session.user.id;
		const parsedId = ignorePluggyAccountSchema.parse(id);

		const pluggyAccount = await db.query.pluggyAccounts.findFirst({
			where: and(
				eq(pluggyAccounts.id, parsedId),
				eq(pluggyAccounts.userId, userId),
			),
		});

		if (!pluggyAccount) {
			return { success: false, error: "Conta do Pluggy não encontrada." };
		}

		const wasLinked = pluggyAccount.statusVinculo === "vinculada";
		const nextStatus =
			pluggyAccount.statusVinculo === "pendente" ? "ignorada" : "pendente";

		await db
			.update(pluggyAccounts)
			.set({
				statusVinculo: nextStatus,
				accountId: null,
				cardId: null,
				lastTransactionCursor: wasLinked
					? null
					: pluggyAccount.lastTransactionCursor,
				updatedAt: new Date(),
			})
			.where(
				and(eq(pluggyAccounts.id, parsedId), eq(pluggyAccounts.userId, userId)),
			);

		revalidatePath("/settings");

		return {
			success: true,
			message:
				nextStatus === "ignorada"
					? "Conta marcada como ignorada."
					: wasLinked
						? "Vínculo desfeito."
						: "Conta voltou para pendente.",
		};
	} catch (error) {
		return handlePluggyActionError(
			error,
			"ignorePluggyAccountAction",
			"Não foi possível atualizar a conta. Tente novamente mais tarde.",
		);
	}
}
