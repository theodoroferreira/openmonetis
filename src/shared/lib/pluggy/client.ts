import "server-only";

import type { z } from "zod";
import {
	type PluggyItem,
	pluggyAuthResponseSchema,
	pluggyItemSchema,
} from "@/shared/lib/pluggy/schemas";

const PLUGGY_API_URL = "https://api.pluggy.ai";

/** A API Key do Pluggy vale 2 horas. Renovamos aos 110 minutos. */
const API_KEY_TTL_MS = 110 * 60 * 1000;

let cachedKey: { apiKey: string; expiresAt: number } | null = null;

export class PluggyError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "PluggyError";
	}
}

/** A feature só aparece quando as duas credenciais existem. */
export function isPluggyConfigured(): boolean {
	return Boolean(
		process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET,
	);
}

/** Limpa o cache. Usado quando a chave é rejeitada pela API. */
export function resetApiKeyCache(): void {
	cachedKey = null;
}

async function requestApiKey(): Promise<string> {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new PluggyError("Pluggy não está configurado.");
	}

	const response = await fetch(`${PLUGGY_API_URL}/auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
		cache: "no-store",
	});

	if (!response.ok) {
		throw new PluggyError("Falha ao autenticar no Pluggy.", response.status);
	}

	const { apiKey } = pluggyAuthResponseSchema.parse(await response.json());
	return apiKey;
}

async function getApiKey(forceRefresh = false): Promise<string> {
	if (!forceRefresh && cachedKey && cachedKey.expiresAt > Date.now()) {
		return cachedKey.apiKey;
	}

	const apiKey = await requestApiKey();
	cachedKey = { apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
	return apiKey;
}

/**
 * Chamada autenticada à API do Pluggy, com a resposta validada por Zod.
 * Em 401/403 reautentica uma vez antes de desistir — cobre o caso da chave
 * ter sido revogada antes do TTL local expirar.
 */
export async function pluggyFetch<T>(
	path: string,
	schema: z.ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	const send = (apiKey: string) =>
		fetch(`${PLUGGY_API_URL}${path}`, {
			...init,
			headers: {
				...init?.headers,
				"Content-Type": "application/json",
				"X-API-KEY": apiKey,
			},
			cache: "no-store",
		});

	let response = await send(await getApiKey());

	if (response.status === 401 || response.status === 403) {
		resetApiKeyCache();
		response = await send(await getApiKey(true));
	}

	if (!response.ok) {
		throw new PluggyError(
			`Pluggy respondeu ${response.status}.`,
			response.status,
		);
	}

	return schema.parse(await response.json());
}

/** Busca um item. Usado para validar um itemId antes de gravá-lo. */
export async function fetchPluggyItem(itemId: string): Promise<PluggyItem> {
	return pluggyFetch(`/items/${itemId}`, pluggyItemSchema);
}
