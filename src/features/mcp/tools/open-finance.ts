import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pluggyItems } from "@/db/schema";
import {
	connectPluggyItemAction,
	disconnectPluggyItemAction,
	ignorePluggyAccountAction,
	linkPluggyAccountAction,
	refreshPluggyItemAction,
} from "@/features/open-finance/actions";
import {
	syncPluggyAccountTransactions,
	syncPluggyItemsAndAccounts,
} from "@/features/open-finance/lib/sync";
import { fetchPluggyItems } from "@/features/open-finance/queries";
import { db } from "@/shared/lib/db";
import { isPluggyConfigured } from "@/shared/lib/pluggy/client";
import { defineTool } from "../lib/define-tool";
import { checkConfirmation } from "../lib/tool-result";
import { confirmName, uuid } from "./schemas";

export const openFinanceTools = [
	defineTool({
		name: "get_open_finance_status",
		title: "Status do Open Finance",
		description:
			"Lista conexões e contas do Open Finance, com último sync e erros.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => ({
			configured: isPluggyConfigured(),
			items: isPluggyConfigured() ? await fetchPluggyItems(userId) : [],
		}),
	}),

	defineTool({
		name: "sync_open_finance",
		title: "Sincronizar Open Finance",
		description:
			"Busca contas e transações no Open Finance e atualiza a inbox.",
		kind: "write",
		input: z.object({}),
		handler: async (_args, { userId }) => {
			if (!isPluggyConfigured()) {
				return { success: false, error: "Integração não configurada." };
			}

			await syncPluggyItemsAndAccounts(userId);
			const data = await syncPluggyAccountTransactions(userId);

			return { success: true, message: "Sincronização concluída.", data };
		},
	}),

	defineTool({
		name: "connect_open_finance_item",
		title: "Vincular conexão",
		description: "Vincula um item do Meu Pluggy pelo identificador.",
		kind: "write",
		input: z.object({ itemId: z.string().min(1) }),
		handler: (args) => connectPluggyItemAction(args),
	}),

	defineTool({
		name: "refresh_open_finance_item",
		title: "Atualizar conexão",
		description: "Atualiza o status de uma conexão no Pluggy.",
		kind: "write",
		input: z.object({ id: uuid() }),
		handler: ({ id }) => refreshPluggyItemAction(id),
	}),

	defineTool({
		name: "disconnect_open_finance_item",
		title: "Desvincular conexão",
		description:
			"Remove a conexão e as contas descobertas dela. Exige confirm com o nome exato do conector.",
		kind: "destructive",
		input: z.object({ id: uuid(), confirm: confirmName() }),
		handler: async ({ id, confirm }, { userId, audit }) => {
			const item = await db.query.pluggyItems.findFirst({
				where: and(eq(pluggyItems.id, id), eq(pluggyItems.userId, userId)),
			});

			if (!item) {
				return { success: false, error: "Conexão não encontrada." };
			}

			const refusal = checkConfirmation(
				item.connectorName ?? item.pluggyItemId,
				confirm,
			);
			if (refusal) return { success: false, error: refusal };

			audit({ affectedIds: [id], snapshot: { item } });

			return disconnectPluggyItemAction(id);
		},
	}),

	defineTool({
		name: "link_open_finance_account",
		title: "Vincular conta descoberta",
		description:
			"Liga uma conta descoberta no Open Finance a uma conta ou cartão existente.",
		kind: "write",
		input: z.object({
			pluggyAccountId: uuid(),
			accountId: uuid().optional(),
			cardId: uuid().optional(),
		}),
		handler: async ({ pluggyAccountId, accountId, cardId }) => {
			if (Boolean(accountId) === Boolean(cardId)) {
				return { success: false, error: "Informe a conta ou o cartão." };
			}

			return linkPluggyAccountAction({
				pluggyAccountId,
				target: accountId
					? { mode: "existing_account", accountId }
					: { mode: "existing_card", cardId: cardId as string },
			});
		},
	}),

	defineTool({
		name: "ignore_open_finance_account",
		title: "Ignorar conta descoberta",
		description:
			"Alterna uma conta descoberta entre ignorada e pendente. Sair de vinculada desfaz o vínculo.",
		kind: "write",
		input: z.object({ id: uuid() }),
		handler: ({ id }) => ignorePluggyAccountAction(id),
	}),
];
