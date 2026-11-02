import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, transactions } from "@/db/schema";
import {
	createCategoryAction,
	deleteCategoryAction,
	updateCategoryAction,
} from "@/features/categories/actions";
import { fetchCategoriesForUser } from "@/features/categories/queries";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { snapshotTransactions } from "../lib/cascade-snapshot";
import { defineTool } from "../lib/define-tool";
import { checkConfirmation } from "../lib/tool-result";
import { confirmName, uuid } from "./schemas";

const categoryFields = {
	name: z.string().min(1),
	type: z.enum(CATEGORY_TYPES),
	icon: z.string().max(100).optional(),
};

export const categoryTools = [
	defineTool({
		name: "list_categories",
		title: "Listar categorias",
		description: "Lista as categorias de despesa e receita.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => fetchCategoriesForUser(userId),
	}),

	defineTool({
		name: "create_category",
		title: "Criar categoria",
		description: "Cria uma categoria.",
		kind: "write",
		input: z.object(categoryFields),
		handler: (args) =>
			createCategoryAction({ ...args, icon: args.icon ?? null }),
	}),

	defineTool({
		name: "update_category",
		title: "Editar categoria",
		description:
			"Atualiza uma categoria: informe só o que muda, o resto é preservado.",
		kind: "write",
		input: z.object(categoryFields).partial().extend({ id: uuid() }),
		handler: async ({ id, ...changes }, { userId, audit }) => {
			const category = await db.query.categories.findFirst({
				where: and(eq(categories.id, id), eq(categories.userId, userId)),
			});

			if (!category) {
				return { success: false, error: "Categoria não encontrada." };
			}

			audit({ affectedIds: [id], snapshot: { category } });

			return updateCategoryAction({
				id,
				name: changes.name ?? category.name,
				type: (changes.type ??
					category.type) as (typeof CATEGORY_TYPES)[number],
				icon: changes.icon ?? category.icon,
			});
		},
	}),

	defineTool({
		name: "delete_category",
		title: "Excluir categoria",
		description:
			"Exclui a categoria e todos os lançamentos dela. Exige confirm com o nome exato.",
		kind: "destructive",
		input: z.object({ id: uuid(), confirm: confirmName() }),
		handler: async ({ id, confirm }, { userId, audit }) => {
			const category = await db.query.categories.findFirst({
				where: and(eq(categories.id, id), eq(categories.userId, userId)),
			});

			if (!category) {
				return { success: false, error: "Categoria não encontrada." };
			}

			const refusal = checkConfirmation(category.name, confirm);
			if (refusal) return { success: false, error: refusal };

			audit({
				affectedIds: [id],
				snapshot: {
					category,
					...(await snapshotTransactions(
						userId,
						eq(transactions.categoryId, id),
					)),
				},
			});

			return deleteCategoryAction({ id });
		},
	}),
];
