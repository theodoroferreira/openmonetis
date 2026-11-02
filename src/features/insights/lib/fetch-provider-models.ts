import { cacheLife } from "next/cache";
import { z } from "zod";
import type { AIProvider } from "../constants";
import {
	collectPages,
	type InsightsModel,
	normalizeAnthropicModels,
	normalizeBaseUrl,
	normalizeGoogleModels,
	normalizeMinimaxModels,
	normalizeOllamaModels,
	normalizeOpenAIModels,
	normalizeOpenRouterModels,
} from "./provider-models";

const REQUEST_TIMEOUT_MS = 5000;
const PAGE_SIZE = "1000";

const googlePageSchema = z.object({
	models: z.array(z.unknown()).default([]),
	nextPageToken: z.string().optional(),
});

const anthropicPageSchema = z.object({
	data: z.array(z.unknown()).default([]),
	has_more: z.boolean().optional(),
	last_id: z.string().nullish(),
});

function bearer(apiKey: string | undefined): Record<string, string> {
	return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function fetchJson(url: URL | string, headers: Record<string, string>) {
	const response = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`Listagem de modelos respondeu ${response.status}`);
	}

	return response.json();
}

async function fetchGoogleModels() {
	const headers = {
		"x-goog-api-key": process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
	};

	const models = await collectPages(async (cursor) => {
		const url = new URL(
			"https://generativelanguage.googleapis.com/v1beta/models",
		);
		url.searchParams.set("pageSize", PAGE_SIZE);
		if (cursor) url.searchParams.set("pageToken", cursor);

		const page = googlePageSchema.parse(await fetchJson(url, headers));
		return { items: page.models, nextCursor: page.nextPageToken };
	});

	return normalizeGoogleModels({ models });
}

async function fetchAnthropicModels() {
	const headers = {
		"x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
		"anthropic-version": "2023-06-01",
	};

	const data = await collectPages(async (cursor) => {
		const url = new URL("https://api.anthropic.com/v1/models");
		url.searchParams.set("limit", PAGE_SIZE);
		if (cursor) url.searchParams.set("after_id", cursor);

		const page = anthropicPageSchema.parse(await fetchJson(url, headers));
		return {
			items: page.data,
			nextCursor: page.has_more ? (page.last_id ?? undefined) : undefined,
		};
	});

	return normalizeAnthropicModels({ data });
}

async function fetchOpenAIModels() {
	return normalizeOpenAIModels(
		await fetchJson(
			"https://api.openai.com/v1/models",
			bearer(process.env.OPENAI_API_KEY),
		),
	);
}

async function fetchMinimaxModels() {
	return normalizeMinimaxModels(
		await fetchJson(
			"https://api.minimax.io/v1/models",
			bearer(process.env.MINIMAX_API_KEY),
		),
	);
}

async function fetchOpenRouterModels() {
	return normalizeOpenRouterModels(
		await fetchJson(
			"https://openrouter.ai/api/v1/models",
			bearer(process.env.OPENROUTER_API_KEY),
		),
	);
}

async function fetchOllamaModels() {
	const baseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL ?? "");

	return normalizeOllamaModels(
		await fetchJson(
			`${baseUrl}/models`,
			bearer(process.env.OLLAMA_API_KEY?.trim()),
		),
	);
}

function listProviderModels(provider: AIProvider): Promise<InsightsModel[]> {
	switch (provider) {
		case "google":
			return fetchGoogleModels();
		case "openai":
			return fetchOpenAIModels();
		case "anthropic":
			return fetchAnthropicModels();
		case "minimax":
			return fetchMinimaxModels();
		case "openrouter":
			return fetchOpenRouterModels();
		case "ollama":
			return fetchOllamaModels();
	}
}

/**
 * Lista os modelos de um provedor usando a chave do `.env`.
 *
 * A chave é lida aqui dentro, e não recebida por argumento, porque os
 * argumentos de uma função com "use cache" entram na chave do cache. Falhas
 * lançam erro para que `fetchInsightsProviders` aplique o fallback sem deixar
 * uma resposta ruim cacheada. O log fica aqui porque, em produção, o Next
 * troca a mensagem de erros que atravessam o "use cache" por uma genérica.
 */
export async function fetchProviderModels(
	provider: AIProvider,
): Promise<InsightsModel[]> {
	"use cache";
	cacheLife({ revalidate: 3600 });

	try {
		return await listProviderModels(provider);
	} catch (error) {
		console.error(`Falha ao listar modelos de ${provider}:`, error);
		throw error;
	}
}
