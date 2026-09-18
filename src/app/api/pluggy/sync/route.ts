import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiTokens } from "@/db/schema";
import {
	syncPluggyAccountTransactions,
	syncPluggyItemsAndAccounts,
} from "@/features/open-finance/lib/sync";
import { extractBearerToken, hashToken } from "@/shared/lib/auth/api-token";
import { db } from "@/shared/lib/db";
import { isPluggyConfigured } from "@/shared/lib/pluggy/client";

// Rate limiting simples em memória (em produção, use Redis), local a esta rota.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 6; // 6 requests
const RATE_WINDOW = 60 * 60 * 1000; // por hora

function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const userLimit = rateLimitMap.get(userId);

	if (!userLimit || userLimit.resetAt < now) {
		rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
		return true;
	}

	if (userLimit.count >= RATE_LIMIT) {
		return false;
	}

	userLimit.count++;
	return true;
}

export async function POST(request: Request) {
	try {
		const authHeader = request.headers.get("Authorization");
		const token = extractBearerToken(authHeader);

		if (!token) {
			return NextResponse.json(
				{ error: "Token não fornecido" },
				{ status: 401 },
			);
		}

		if (!token.startsWith("opm_")) {
			return NextResponse.json(
				{ error: "Formato de token inválido" },
				{ status: 401 },
			);
		}

		const tokenHash = hashToken(token);

		const tokenRecord = await db.query.apiTokens.findFirst({
			where: and(
				eq(apiTokens.tokenHash, tokenHash),
				isNull(apiTokens.revokedAt),
				gt(apiTokens.expiresAt, new Date()),
			),
		});

		if (!tokenRecord) {
			return NextResponse.json(
				{ error: "Token inválido ou revogado" },
				{ status: 401 },
			);
		}

		if (!checkRateLimit(tokenRecord.userId)) {
			return NextResponse.json(
				{ error: "Limite de requisições excedido", retryAfter: 3600 },
				{ status: 429 },
			);
		}

		if (!isPluggyConfigured()) {
			return NextResponse.json(
				{ error: "Integração não configurada." },
				{ status: 500 },
			);
		}

		await syncPluggyItemsAndAccounts(tokenRecord.userId);
		const result = await syncPluggyAccountTransactions(tokenRecord.userId);

		const clientIp =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
			request.headers.get("x-real-ip") ||
			null;

		await db
			.update(apiTokens)
			.set({
				lastUsedAt: new Date(),
				lastUsedIp: clientIp,
			})
			.where(eq(apiTokens.id, tokenRecord.id));

		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		console.error("[API] Error syncing Pluggy:", error);
		return NextResponse.json(
			{ error: "Erro ao sincronizar Open Finance" },
			{ status: 500 },
		);
	}
}
