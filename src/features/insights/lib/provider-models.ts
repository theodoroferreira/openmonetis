import { z } from "zod";
import { type AIProvider, DEFAULT_MODEL, PROVIDERS } from "../constants";

export type InsightsModel = {
	id: string;
	name: string;
	provider: AIProvider;
};

export type InsightsProviderOption = {
	provider: AIProvider;
	models: InsightsModel[];
	/** A listagem falhou e os modelos exibidos são os estáticos. */
	listFailed: boolean;
};

const PROVIDER_ENV_VARS: Record<AIProvider, string> = {
	openai: "OPENAI_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
	google: "GOOGLE_GENERATIVE_AI_API_KEY",
	minimax: "MINIMAX_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	// O Ollama não exige segredo: o que o habilita é o endereço da instância.
	ollama: "OLLAMA_BASE_URL",
};

const CUSTOM_MODEL_PROVIDERS = ["openrouter", "ollama"] as const;
type CustomModelProvider = (typeof CUSTOM_MODEL_PROVIDERS)[number];

const MAX_PAGES = 20;

const GOOGLE_NON_TEXT_MODEL = /embedding|tts|image|audio|live|aqa|robotics/i;
const OPENAI_TEXT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_NON_TEXT_MODEL =
	/audio|realtime|tts|transcribe|image|search|embedding|instruct/i;
const OLLAMA_NON_TEXT_MODEL = /embed/i;

const googleResponseSchema = z.object({
	models: z
		.array(
			z.object({
				name: z.string(),
				displayName: z.string().optional(),
				supportedGenerationMethods: z.array(z.string()).optional(),
			}),
		)
		.default([]),
});

const listResponseSchema = z.object({
	data: z
		.array(
			z.object({
				id: z.string(),
				name: z.string().optional(),
				display_name: z.string().optional(),
			}),
		)
		.default([]),
});

function sortNewestFirst(models: InsightsModel[]) {
	return models.toSorted((a, b) =>
		b.id.localeCompare(a.id, "en", { numeric: true }),
	);
}

export function isCustomModelProvider(
	provider: AIProvider,
): provider is CustomModelProvider {
	return CUSTOM_MODEL_PROVIDERS.includes(provider as CustomModelProvider);
}

export function stripCustomProviderPrefix(value: string, provider: AIProvider) {
	if (!isCustomModelProvider(provider)) {
		return value;
	}

	return value.startsWith(`${provider}:`)
		? value.slice(`${provider}:`.length).trim()
		: value.trim();
}

export function getConfiguredProviders(
	env: Record<string, string | undefined>,
): AIProvider[] {
	return (Object.keys(PROVIDERS) as AIProvider[]).filter((provider) =>
		Boolean(env[PROVIDER_ENV_VARS[provider]]?.trim()),
	);
}

export function normalizeBaseUrl(url: string) {
	return url.trim().replace(/\/+$/, "");
}

export function normalizeGoogleModels(payload: unknown): InsightsModel[] {
	const { models } = googleResponseSchema.parse(payload);

	return sortNewestFirst(
		models
			.filter((model) =>
				model.supportedGenerationMethods?.includes("generateContent"),
			)
			.map((model) => {
				const id = model.name.replace(/^models\//, "");
				return {
					id,
					name: model.displayName ?? id,
					provider: "google" as const,
				};
			})
			.filter(
				(model) =>
					model.id.startsWith("gemini-") &&
					!GOOGLE_NON_TEXT_MODEL.test(model.id),
			),
	);
}

export function normalizeOpenAIModels(payload: unknown): InsightsModel[] {
	const { data } = listResponseSchema.parse(payload);

	return sortNewestFirst(
		data
			.filter(
				(model) =>
					OPENAI_TEXT_MODEL.test(model.id) &&
					!OPENAI_NON_TEXT_MODEL.test(model.id),
			)
			.map((model) => ({
				id: model.id,
				name: model.id,
				provider: "openai" as const,
			})),
	);
}

export function normalizeAnthropicModels(payload: unknown): InsightsModel[] {
	const { data } = listResponseSchema.parse(payload);

	return sortNewestFirst(
		data.map((model) => ({
			id: model.id,
			name: model.display_name ?? model.id,
			provider: "anthropic" as const,
		})),
	);
}

export function normalizeMinimaxModels(payload: unknown): InsightsModel[] {
	const { data } = listResponseSchema.parse(payload);

	return sortNewestFirst(
		data
			.filter((model) => model.id.startsWith("MiniMax-"))
			.map((model) => ({
				id: model.id,
				name: model.id,
				provider: "minimax" as const,
			})),
	);
}

export function normalizeOpenRouterModels(payload: unknown): InsightsModel[] {
	const { data } = listResponseSchema.parse(payload);

	return sortNewestFirst(
		data.map((model) => ({
			id: `openrouter:${model.id}`,
			name: model.name ?? model.id,
			provider: "openrouter" as const,
		})),
	);
}

export function normalizeOllamaModels(payload: unknown): InsightsModel[] {
	const { data } = listResponseSchema.parse(payload);

	return sortNewestFirst(
		data
			.filter((model) => !OLLAMA_NON_TEXT_MODEL.test(model.id))
			.map((model) => ({
				id: `ollama:${model.id}`,
				name: model.id,
				provider: "ollama" as const,
			})),
	);
}

/**
 * Percorre uma listagem paginada, com limite de páginas para que uma API que
 * repita o cursor não prenda o carregamento da tela.
 */
export async function collectPages<T>(
	fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> {
	const items: T[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result = await fetchPage(cursor);
		items.push(...result.items);
		if (!result.nextCursor) break;
		cursor = result.nextCursor;
	}

	return items;
}

export function inferProviderFromModelId(modelId: string): AIProvider | null {
	if (modelId.startsWith("openrouter:")) return "openrouter";
	if (modelId.startsWith("ollama:")) return "ollama";
	if (modelId.includes("/")) return "openrouter";
	if (OPENAI_TEXT_MODEL.test(modelId)) return "openai";
	if (modelId.startsWith("claude-")) return "anthropic";
	if (modelId.startsWith("gemini-")) return "google";
	if (modelId.startsWith("MiniMax-")) return "minimax";
	return null;
}

export function pickDefaultModel(
	options: InsightsProviderOption[],
): string | null {
	const models = options.flatMap((option) => option.models);

	if (models.some((model) => model.id === DEFAULT_MODEL)) {
		return DEFAULT_MODEL;
	}

	const firstModel = models[0];
	if (firstModel) return firstModel.id;

	const customProvider = options.find((option) =>
		isCustomModelProvider(option.provider),
	);
	return customProvider ? `${customProvider.provider}:` : null;
}

export function resolveInitialModel(
	savedModelId: string | null | undefined,
	options: InsightsProviderOption[],
): string | null {
	if (savedModelId) {
		const provider = inferProviderFromModelId(savedModelId);
		const option = options.find((item) => item.provider === provider);

		if (
			option &&
			(isCustomModelProvider(option.provider) ||
				option.models.some((model) => model.id === savedModelId))
		) {
			return savedModelId;
		}
	}

	return pickDefaultModel(options);
}

export type InsightsModelRoute =
	| { success: true; provider: AIProvider; modelId: string }
	| { success: false; error: string };

export function routeInsightsModel(
	modelId: string,
	options: InsightsProviderOption[],
): InsightsModelRoute {
	const normalizedModelId = modelId.trim();
	const provider = inferProviderFromModelId(normalizedModelId);

	if (!provider) {
		return { success: false, error: "Modelo inválido." };
	}

	const option = options.find((item) => item.provider === provider);
	if (!option) {
		return { success: false, error: "Provedor não configurado no .env." };
	}

	if (isCustomModelProvider(provider)) {
		const customModelId = stripCustomProviderPrefix(
			normalizedModelId,
			provider,
		);

		if (!customModelId) {
			return {
				success: false,
				error: `Informe um modelo válido do ${PROVIDERS[provider].name}.`,
			};
		}

		return { success: true, provider, modelId: customModelId };
	}

	if (!option.models.some((model) => model.id === normalizedModelId)) {
		return { success: false, error: "Modelo inválido." };
	}

	return { success: true, provider, modelId: normalizedModelId };
}
