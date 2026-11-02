import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { minimax } from "vercel-minimax-ai-provider";
import { fetchInsightsProviders } from "../queries";
import { normalizeBaseUrl, routeInsightsModel } from "./provider-models";

type ResolveInsightsModelResult =
	| { success: true; model: LanguageModel }
	| { success: false; error: string };

export async function resolveInsightsModel(
	modelId: string,
): Promise<ResolveInsightsModelResult> {
	const route = routeInsightsModel(modelId, await fetchInsightsProviders());
	if (!route.success) {
		return route;
	}

	switch (route.provider) {
		case "openrouter": {
			const openrouter = createOpenRouter({
				apiKey: process.env.OPENROUTER_API_KEY,
			});
			return { success: true, model: openrouter.chat(route.modelId) };
		}
		case "ollama": {
			const ollama = createOpenAICompatible({
				name: "ollama",
				baseURL: normalizeBaseUrl(process.env.OLLAMA_BASE_URL ?? ""),
				apiKey: process.env.OLLAMA_API_KEY || "ollama",
				supportsStructuredOutputs: false,
			});
			return { success: true, model: ollama.chatModel(route.modelId) };
		}
		case "openai":
			return { success: true, model: openai(route.modelId) };
		case "anthropic":
			return { success: true, model: anthropic(route.modelId) };
		case "google":
			return { success: true, model: google(route.modelId) };
		case "minimax":
			return { success: true, model: minimax(route.modelId) };
	}
}
