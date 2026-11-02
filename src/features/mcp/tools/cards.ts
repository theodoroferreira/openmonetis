import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cards, transactions } from "@/db/schema";
import {
	createCardAction,
	deleteCardAction,
	updateCardAction,
} from "@/features/cards/actions";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import { db } from "@/shared/lib/db";
import { snapshotTransactions } from "../lib/cascade-snapshot";
import { defineTool } from "../lib/define-tool";
import { checkConfirmation } from "../lib/tool-result";
import { confirmName, uuid } from "./schemas";

const dayOfMonth = () =>
	z
		.string()
		.regex(/^\d{1,2}$/)
		.describe("Dia do mês, de 1 a 31.");

const cardFields = {
	name: z.string().min(1),
	brand: z.string().min(1),
	status: z.enum(["Ativo", "Inativo"]),
	closingDay: dayOfMonth(),
	dueDay: dayOfMonth(),
	note: z.string().max(500).optional(),
	limit: z.number().min(0),
	logo: z
		.string()
		.min(1)
		.describe("Um dos valores de logoOptions em list_cards."),
	accountId: uuid().describe("Conta que paga a fatura."),
};

const withoutLogo = <T extends { logo?: unknown }>({
	logo: _logo,
	...card
}: T) => card;

export const cardTools = [
	defineTool({
		name: "list_cards",
		title: "Listar cartões",
		description: "Lista cartões ativos e inativos com limite e dias da fatura.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => {
			const data = await fetchAllCardsForUser(userId);

			return {
				activeCards: data.activeCards.map(withoutLogo),
				archivedCards: data.archivedCards.map(withoutLogo),
				logoOptions: data.logoOptions,
			};
		},
	}),

	defineTool({
		name: "create_card",
		title: "Criar cartão",
		description: "Cria um cartão de crédito.",
		kind: "write",
		input: z.object(cardFields),
		handler: (args) => createCardAction({ ...args, note: args.note ?? null }),
	}),

	defineTool({
		name: "update_card",
		title: "Editar cartão",
		description:
			"Atualiza um cartão: informe só o que muda, o resto é preservado.",
		kind: "write",
		input: z.object(cardFields).partial().extend({ id: uuid() }),
		handler: async ({ id, ...changes }, { userId, audit }) => {
			const card = await db.query.cards.findFirst({
				where: and(eq(cards.id, id), eq(cards.userId, userId)),
			});

			if (!card) {
				return { success: false, error: "Cartão não encontrado." };
			}

			audit({ affectedIds: [id], snapshot: { card } });

			return updateCardAction({
				id,
				name: changes.name ?? card.name,
				brand: changes.brand ?? card.brand ?? "",
				status: changes.status ?? card.status,
				closingDay: changes.closingDay ?? card.closingDay,
				dueDay: changes.dueDay ?? card.dueDay,
				note: changes.note ?? card.note,
				limit: changes.limit ?? Number(card.limit),
				logo: changes.logo ?? card.logo ?? "",
				accountId: changes.accountId ?? card.accountId,
			});
		},
	}),

	defineTool({
		name: "delete_card",
		title: "Excluir cartão",
		description:
			"Exclui o cartão e todos os lançamentos dele. Exige confirm com o nome exato.",
		kind: "destructive",
		input: z.object({ id: uuid(), confirm: confirmName() }),
		handler: async ({ id, confirm }, { userId, audit }) => {
			const card = await db.query.cards.findFirst({
				where: and(eq(cards.id, id), eq(cards.userId, userId)),
			});

			if (!card) {
				return { success: false, error: "Cartão não encontrado." };
			}

			const refusal = checkConfirmation(card.name, confirm);
			if (refusal) return { success: false, error: refusal };

			audit({
				affectedIds: [id],
				snapshot: {
					card,
					...(await snapshotTransactions(userId, eq(transactions.cardId, id))),
				},
			});

			return deleteCardAction({ id });
		},
	}),
];
