import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { savedInsights } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	type InsightsResponse,
	InsightsResponseSchema,
} from "@/shared/lib/schemas/insights";
import { FALLBACK_MODELS } from "./constants";
import { fetchProviderModels } from "./lib/fetch-provider-models";
import {
	getConfiguredProviders,
	type InsightsProviderOption,
} from "./lib/provider-models";

/**
 * Provedores com segredo no `.env` e seus modelos. Se a listagem falhar ou
 * vier vazia, o provedor continua disponível com a lista estática.
 */
export async function fetchInsightsProviders(): Promise<
	InsightsProviderOption[]
> {
	const providers = getConfiguredProviders(process.env);
	const results = await Promise.allSettled(
		providers.map((provider) => fetchProviderModels(provider)),
	);

	return providers.map((provider, index) => {
		const result = results[index];

		if (result?.status === "fulfilled" && result.value.length > 0) {
			return { provider, models: result.value, listFailed: false };
		}

		return {
			provider,
			models: FALLBACK_MODELS.filter((model) => model.provider === provider),
			listFailed: true,
		};
	});
}

export const savedInsightsPeriodSchema = z
	.string()
	.regex(/^\d{4}-\d{2}$/, "Período inválido (formato esperado: YYYY-MM)");

export type SavedInsightsRecord = {
	insights: InsightsResponse;
	modelId: string;
	createdAt: string;
};

export async function fetchSavedInsights(
	userId: string,
	period: string,
): Promise<SavedInsightsRecord | null> {
	const validatedPeriod = savedInsightsPeriodSchema.parse(period);

	const result = await db
		.select()
		.from(savedInsights)
		.where(
			and(
				eq(savedInsights.userId, userId),
				eq(savedInsights.period, validatedPeriod),
			),
		)
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	const saved = result[0];
	const insights = InsightsResponseSchema.parse(JSON.parse(saved.data));

	return {
		insights,
		modelId: saved.modelId,
		createdAt: saved.createdAt.toISOString(),
	};
}
