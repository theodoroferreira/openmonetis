import { z } from "zod";
import {
	deleteSavedInsightsAction,
	generateInsightsAction,
	saveInsightsAction,
} from "@/features/insights/actions";
import {
	fetchInsightsProviders,
	fetchSavedInsights,
} from "@/features/insights/queries";
import { defineTool } from "../lib/define-tool";
import { period } from "./schemas";

export const insightTools = [
	defineTool({
		name: "list_insight_models",
		title: "Listar modelos de insights",
		description: "Lista provedores e modelos disponíveis para gerar insights.",
		kind: "read",
		input: z.object({}),
		handler: async () => ({ providers: await fetchInsightsProviders() }),
	}),

	defineTool({
		name: "get_saved_insights",
		title: "Ver insights salvos",
		description: "Devolve os insights salvos do período.",
		kind: "read",
		input: z.object({ period: period() }),
		handler: ({ period: selected }, { userId }) =>
			fetchSavedInsights(userId, selected),
	}),

	defineTool({
		name: "generate_insights",
		title: "Gerar insights",
		description:
			"Gera insights do período com o modelo informado e salva o resultado. Consome a chave de IA configurada.",
		kind: "write",
		input: z.object({
			period: period(),
			modelId: z.string().min(1),
			instructions: z.string().optional(),
		}),
		handler: async ({ period: selected, modelId, instructions }) => {
			const result = await generateInsightsAction(
				selected,
				modelId,
				instructions,
			);

			if (!result.success || !result.data) return result;

			const saved = await saveInsightsAction(selected, modelId, result.data);

			return saved.success ? result : saved;
		},
	}),

	defineTool({
		name: "delete_saved_insights",
		title: "Excluir insights salvos",
		description: "Exclui os insights salvos do período.",
		kind: "destructive",
		input: z.object({ period: period() }),
		handler: ({ period: selected }) => deleteSavedInsightsAction(selected),
	}),
];
