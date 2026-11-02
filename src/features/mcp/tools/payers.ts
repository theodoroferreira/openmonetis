import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { payers, transactions } from "@/db/schema";
import {
	createPayerAction,
	deletePayerAction,
	updatePayerAction,
} from "@/features/payers/actions";
import { sendPayerSummaryAction } from "@/features/payers/lib/detail-actions";
import { fetchPayersForUser } from "@/features/payers/queries";
import { db } from "@/shared/lib/db";
import { PAYER_STATUS_OPTIONS } from "@/shared/lib/payers/constants";
import { snapshotTransactions } from "../lib/cascade-snapshot";
import { defineTool } from "../lib/define-tool";
import { checkConfirmation } from "../lib/tool-result";
import { confirmName, period, uuid } from "./schemas";

const payerFields = {
	name: z.string().min(1),
	email: z.string().email().optional(),
	status: z.enum(PAYER_STATUS_OPTIONS),
	note: z.string().max(500).optional(),
	isAutoSend: z.boolean().optional(),
};

export const payerTools = [
	defineTool({
		name: "list_payers",
		title: "Listar pessoas",
		description: "Lista as pessoas cadastradas.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => {
			const { payers: rows } = await fetchPayersForUser(userId);
			return { payers: rows };
		},
	}),

	defineTool({
		name: "create_payer",
		title: "Criar pessoa",
		description: "Cadastra uma pessoa.",
		kind: "write",
		input: z.object(payerFields),
		handler: (args) =>
			createPayerAction({
				...args,
				email: args.email ?? null,
				note: args.note ?? null,
				isAutoSend: args.isAutoSend ?? false,
			}),
	}),

	defineTool({
		name: "update_payer",
		title: "Editar pessoa",
		description:
			"Atualiza uma pessoa: informe só o que muda, o resto é preservado.",
		kind: "write",
		input: z.object(payerFields).partial().extend({ id: uuid() }),
		handler: async ({ id, ...changes }, { userId, audit }) => {
			const payer = await db.query.payers.findFirst({
				where: and(eq(payers.id, id), eq(payers.userId, userId)),
			});

			if (!payer) {
				return { success: false, error: "Pessoa não encontrada." };
			}

			audit({ affectedIds: [id], snapshot: { payer } });

			return updatePayerAction({
				id,
				name: changes.name ?? payer.name,
				email: changes.email ?? payer.email,
				status: changes.status ?? payer.status,
				note: changes.note ?? payer.note,
				isAutoSend: changes.isAutoSend ?? payer.isAutoSend,
			});
		},
	}),

	defineTool({
		name: "delete_payer",
		title: "Excluir pessoa",
		description:
			"Exclui a pessoa e todos os lançamentos dela. Exige confirm com o nome exato.",
		kind: "destructive",
		input: z.object({ id: uuid(), confirm: confirmName() }),
		handler: async ({ id, confirm }, { userId, audit }) => {
			const payer = await db.query.payers.findFirst({
				where: and(eq(payers.id, id), eq(payers.userId, userId)),
			});

			if (!payer) {
				return { success: false, error: "Pessoa não encontrada." };
			}

			const refusal = checkConfirmation(payer.name, confirm);
			if (refusal) return { success: false, error: refusal };

			audit({
				affectedIds: [id],
				snapshot: {
					payer,
					...(await snapshotTransactions(userId, eq(transactions.payerId, id))),
				},
			});

			return deletePayerAction({ id });
		},
	}),

	defineTool({
		name: "send_payer_summary",
		title: "Enviar resumo por e-mail",
		description:
			"Envia por e-mail o resumo do período para a pessoa. É a única forma de o bot disparar e-mail.",
		kind: "write",
		input: z.object({ payerId: uuid(), period: period() }),
		handler: (args) => sendPayerSummaryAction(args),
	}),
];
