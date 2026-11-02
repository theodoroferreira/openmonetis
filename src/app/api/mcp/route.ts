import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/features/mcp/lib/rate-limit";
import { GENERIC_ERROR } from "@/features/mcp/lib/tool-result";
import { MCP_INSTRUCTIONS, registerMcpTools } from "@/features/mcp/server";
import { version } from "@/package.json";
import type { Actor } from "@/shared/lib/auth/actor";
import { authenticateApiToken } from "@/shared/lib/auth/api-token";

const RATE_LIMIT_PER_MINUTE = 120;
const checkRateLimit = createRateLimiter(RATE_LIMIT_PER_MINUTE, 60 * 1000);

const mcpHandler = createMcpHandler(registerMcpTools, {
	serverInfo: { name: "openmonetis", version },
	instructions: MCP_INSTRUCTIONS,
});

async function handle(request: Request): Promise<Response> {
	try {
		const token = await authenticateApiToken(request, "mcp");

		if (!token) {
			return NextResponse.json(
				{ error: "Não autorizado" },
				{ status: 401, headers: { "WWW-Authenticate": "Bearer" } },
			);
		}

		if (!checkRateLimit(token.tokenId)) {
			return NextResponse.json(
				{ error: "Limite de requisições excedido", retryAfter: 60 },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const actor: Actor = {
			kind: "mcp",
			tokenId: token.tokenId,
			user: token.user,
		};

		// O ator segue por `authInfo` e é aplicado por `defineTool`, em vez de
		// depender do contexto assíncrono sobreviver ao transporte do SDK.
		request.auth = {
			token: "",
			clientId: token.tokenId,
			scopes: ["mcp"],
			extra: { actor },
		};

		return await mcpHandler(request);
	} catch (error) {
		console.error("[MCP] Erro na rota:", error);
		return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
	}
}

export { handle as DELETE, handle as GET, handle as POST };
