import { z } from "zod";
import {
	createBudgetAction,
	deleteBudgetAction,
	duplicatePreviousMonthBudgetsAction,
	updateBudgetAction,
} from "@/features/budgets/actions";
import { fetchBudgetsForUser } from "@/features/budgets/queries";
import { defineTool } from "../lib/define-tool";
import { period, uuid } from "./schemas";

const budgetFields = {
	categoryId: uuid(),
	period: period(),
	amount: z.number().min(0),
};

export const budgetTools = [
	defineTool({
		name: "list_budgets",
		title: "Listar orçamentos",
		description: "Lista os orçamentos do período com o valor já gasto.",
		kind: "read",
		input: z.object({ period: period() }),
		handler: async ({ period: selected }, { userId }) => {
			const { budgets } = await fetchBudgetsForUser(userId, selected);
			return { budgets };
		},
	}),

	defineTool({
		name: "create_budget",
		title: "Criar orçamento",
		description: "Cria o orçamento de uma categoria de despesa no período.",
		kind: "write",
		input: z.object(budgetFields),
		handler: ({ amount, ...args }) =>
			createBudgetAction({ ...args, amount: amount.toFixed(2) }),
	}),

	defineTool({
		name: "update_budget",
		title: "Editar orçamento",
		description: "Atualiza um orçamento.",
		kind: "write",
		input: z.object({ id: uuid(), ...budgetFields }),
		handler: async ({ amount, ...args }, { audit }) => {
			audit({ affectedIds: [args.id] });
			return updateBudgetAction({ ...args, amount: amount.toFixed(2) });
		},
	}),

	defineTool({
		name: "delete_budget",
		title: "Excluir orçamento",
		description: "Exclui um orçamento. Não apaga lançamentos.",
		kind: "destructive",
		input: z.object({ id: uuid() }),
		handler: async ({ id }, { audit }) => {
			audit({ affectedIds: [id] });
			return deleteBudgetAction({ id });
		},
	}),

	defineTool({
		name: "duplicate_previous_month_budgets",
		title: "Copiar orçamentos do mês anterior",
		description: "Copia para o período os orçamentos do mês anterior.",
		kind: "write",
		input: z.object({ period: period() }),
		handler: (args) => duplicatePreviousMonthBudgetsAction(args),
	}),
];
