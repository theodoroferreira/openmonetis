import type {
	CallToolResult,
	McpServer,
	ServerContext,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { type Actor, runAsActor } from "@/shared/lib/auth/actor";
import { writeAuditEntry } from "./audit";
import { toErrorResult, toToolResult } from "./tool-result";

/**
 * `read` não escreve auditoria; `write` e `destructive` sempre escrevem.
 * `destructive` também sinaliza ao cliente que a ferramenta apaga dados.
 */
type ToolKind = "read" | "write" | "destructive";

type ToolRuntime = {
	userId: string;
	/** Complementa a linha de auditoria desta chamada. */
	audit: (details: {
		affectedIds?: string[];
		snapshot?: unknown;
		dryRun?: boolean;
		/** Texto para a auditoria quando o retorno é JSON, não uma frase. */
		summary?: string;
	}) => void;
};

type ToolDefinition<TInput extends z.ZodObject> = {
	name: string;
	title: string;
	description: string;
	kind: ToolKind;
	input: TInput;
	handler: (args: z.output<TInput>, runtime: ToolRuntime) => Promise<unknown>;
};

export type ToolRegistrar = (server: McpServer) => void;

const firstText = (result: CallToolResult): string | null => {
	const [content] = result.content;
	return content?.type === "text" ? content.text : null;
};

function readActor(ctx: ServerContext): Actor | null {
	const actor = ctx.http?.authInfo?.extra?.actor;
	return actor ? (actor as Actor) : null;
}

/**
 * Registra uma ferramenta com o contrato único do servidor: roda dentro do
 * ator do token, converte `ActionResult`, audita escritas e nunca devolve
 * detalhes de erro ao cliente.
 */
export function defineTool<TInput extends z.ZodObject>(
	definition: ToolDefinition<TInput>,
): ToolRegistrar {
	const { name, title, description, kind, input, handler } = definition;

	return (server) => {
		const callback = async (
			args: z.output<TInput>,
			ctx: ServerContext,
		): Promise<CallToolResult> => {
			const actor = readActor(ctx);

			if (!actor) {
				console.error("[MCP] Chamada sem ator:", name);
				return toErrorResult();
			}

			const auditDetails: Parameters<ToolRuntime["audit"]>[0] = {};
			let result: CallToolResult;

			try {
				const value = await runAsActor(actor, () =>
					handler(args, {
						userId: actor.user.id,
						audit: (details) => Object.assign(auditDetails, details),
					}),
				);
				result = toToolResult(value);
			} catch (error) {
				console.error("[MCP] Erro na ferramenta:", name, error);
				result = toErrorResult();
			}

			if (kind !== "read") {
				await writeAuditEntry({
					userId: actor.user.id,
					tokenId: actor.tokenId,
					tool: name,
					arguments: args,
					result: result.isError
						? "error"
						: auditDetails.dryRun
							? "dry_run"
							: "success",
					message: result.isError
						? firstText(result)
						: (auditDetails.summary ?? firstText(result)),
					affectedIds: auditDetails.affectedIds,
					snapshot: auditDetails.snapshot,
				});
			}

			return result;
		};

		server.registerTool(
			name,
			{
				title,
				description,
				inputSchema: input,
				annotations: {
					title,
					readOnlyHint: kind === "read",
					destructiveHint: kind === "destructive",
					openWorldHint: false,
				},
			},
			callback as never,
		);
	};
}
