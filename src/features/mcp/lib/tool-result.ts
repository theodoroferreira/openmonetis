import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ActionResult } from "@/shared/lib/types/actions";

export const GENERIC_ERROR = "Algo deu errado";

const textResult = (text: string, isError?: boolean): CallToolResult => ({
	content: [{ type: "text", text }],
	...(isError ? { isError: true } : {}),
});

function isActionResult(value: unknown): value is ActionResult<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { success?: unknown }).success === "boolean"
	);
}

/** Converte o retorno de uma ferramenta, seja `ActionResult` ou dados comuns. */
export function toToolResult(value: unknown): CallToolResult {
	if (!isActionResult(value)) {
		return textResult(JSON.stringify(value ?? null));
	}

	if (!value.success) {
		return textResult(value.error, true);
	}

	const { message, data } = value;
	const payload =
		typeof data === "object" && data !== null && !Array.isArray(data)
			? { message, ...data }
			: data === undefined
				? { message }
				: { message, data };

	return textResult(JSON.stringify(payload));
}

export function toErrorResult(): CallToolResult {
	return textResult(GENERIC_ERROR, true);
}

/** Exclusão em cascata exige repetir o nome exato; devolve o erro ou `null`. */
export function checkConfirmation(
	expectedName: string,
	confirm: string | undefined,
): string | null {
	if (confirm === expectedName) return null;

	return `Exclusão não confirmada: repita em confirm o nome exato "${expectedName}".`;
}
