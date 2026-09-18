import "server-only";

import type { z } from "zod";
import {
	type PluggyAccount,
	type PluggyItem,
	type PluggyTransaction,
	pluggyAccountsListResponseSchema,
	pluggyAuthResponseSchema,
	pluggyItemSchema,
	pluggyTransactionsPageSchema,
} from "@/shared/lib/pluggy/schemas";

const PLUGGY_API_URL = "https://api.pluggy.ai";

/** A API Key do Pluggy vale 2 horas. Renovamos aos 110 minutos. */
const API_KEY_TTL_MS = 110 * 60 * 1000;

/** Timeout para toda chamada HTTP ao Pluggy. */
const PLUGGY_FETCH_TIMEOUT_MS = 15_000;

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
		signal: AbortSignal.timeout(PLUGGY_FETCH_TIMEOUT_MS),
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
			signal: AbortSignal.timeout(PLUGGY_FETCH_TIMEOUT_MS),
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

/** Converte um timestamp ISO opcional do Pluggy (ex: `item.updatedAt`) em Date, ou null. */
export function parsePluggyDate(value?: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Busca um item. Usado para validar um itemId antes de gravá-lo. */
export async function fetchPluggyItem(itemId: string): Promise<PluggyItem> {
	return pluggyFetch(`/items/${itemId}`, pluggyItemSchema);
}

/** Lista todas as contas (bancárias e de cartão) descobertas para um item. */
export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
	const params = new URLSearchParams({ itemId });
	const page = await pluggyFetch(
		`/accounts?${params.toString()}`,
		pluggyAccountsListResponseSchema,
	);
	return page.results;
}

/**
 * Extrai o valor de `after` do campo `next` da resposta paginada.
 * `next` é a query string pronta para a próxima página; nunca deve ser
 * reenviado inteiro — apenas o valor decodificado de `after`.
 */
function extractAfterCursor(next: string | null): string | null {
	if (!next) return null;
	const query = next.startsWith("?") ? next.slice(1) : next;
	return new URLSearchParams(query).get("after");
}

/**
 * Lista transações de uma conta via `/v2/transactions` (cursor-based).
 * Nunca usa o endpoint `/transactions` (deprecado).
 */
export async function listTransactions({
	accountId,
	after,
	dateFrom,
}: {
	accountId: string;
	after?: string;
	dateFrom?: string;
}): Promise<{ results: PluggyTransaction[]; after: string | null }> {
	const params = new URLSearchParams({ accountId });
	if (after) params.set("after", after);
	if (dateFrom) params.set("dateFrom", dateFrom);

	const page = await pluggyFetch(
		`/v2/transactions?${params.toString()}`,
		pluggyTransactionsPageSchema,
	);

	return { results: page.results, after: extractAfterCursor(page.next) };
}
