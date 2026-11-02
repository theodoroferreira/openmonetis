import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { apiTokens, user } from "@/db/schema";
import { db } from "@/shared/lib/db";

export type ApiTokenScope = "companion" | "mcp";

export type AuthenticatedApiToken = {
	tokenId: string;
	user: {
		id: string;
		name: string;
		email: string;
	};
};

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	return match ? match[1] : null;
}

/**
 * Valida o bearer token da requisição exigindo o escopo informado. Token
 * ausente, malformado, revogado, expirado ou de outro escopo devolve `null`,
 * sem distinguir o motivo para quem chama.
 */
export async function authenticateApiToken(
	request: Request,
	scope: ApiTokenScope,
): Promise<AuthenticatedApiToken | null> {
	const token = extractBearerToken(request.headers.get("Authorization"));

	if (!token?.startsWith("opm_")) {
		return null;
	}

	const [row] = await db
		.select({
			tokenId: apiTokens.id,
			userId: user.id,
			userName: user.name,
			userEmail: user.email,
		})
		.from(apiTokens)
		.innerJoin(user, eq(apiTokens.userId, user.id))
		.where(
			and(
				eq(apiTokens.tokenHash, hashToken(token)),
				eq(apiTokens.scope, scope),
				isNull(apiTokens.revokedAt),
				gt(apiTokens.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!row) {
		return null;
	}

	const clientIp =
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		null;

	await db
		.update(apiTokens)
		.set({ lastUsedAt: new Date(), lastUsedIp: clientIp })
		.where(eq(apiTokens.id, row.tokenId));

	return {
		tokenId: row.tokenId,
		user: { id: row.userId, name: row.userName, email: row.userEmail },
	};
}
