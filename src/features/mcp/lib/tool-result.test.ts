import { describe, expect, it } from "vitest";
import {
	checkConfirmation,
	GENERIC_ERROR,
	toErrorResult,
	toToolResult,
} from "./tool-result";

const parse = (result: { content: { type: string; text?: string }[] }) =>
	JSON.parse(result.content[0]?.text ?? "null");

describe("toToolResult", () => {
	it("converte ActionResult de sucesso preservando os dados", () => {
		const result = toToolResult({
			success: true,
			message: "Criado.",
			data: { ids: ["a"] },
		});

		expect(result.isError).toBeUndefined();
		expect(parse(result)).toEqual({ message: "Criado.", ids: ["a"] });
	});

	it("converte ActionResult de erro com a mensagem da action", () => {
		const result = toToolResult({ success: false, error: "Fatura paga." });

		expect(result.isError).toBe(true);
		expect(result.content[0]).toEqual({ type: "text", text: "Fatura paga." });
	});

	it("serializa dados comuns como JSON", () => {
		expect(parse(toToolResult({ items: [1] }))).toEqual({ items: [1] });
	});

	it("nao trata objeto com campo success numerico como ActionResult", () => {
		expect(parse(toToolResult({ success: 3 }))).toEqual({ success: 3 });
	});
});

describe("toErrorResult", () => {
	it("nunca expoe detalhes do erro", () => {
		expect(toErrorResult()).toEqual({
			isError: true,
			content: [{ type: "text", text: GENERIC_ERROR }],
		});
	});
});

describe("checkConfirmation", () => {
	it("exige o nome exato", () => {
		expect(checkConfirmation("Nubank", "Nubank")).toBeNull();
		expect(checkConfirmation("Nubank", "nubank")).toContain("Nubank");
		expect(checkConfirmation("Nubank", undefined)).toContain("Nubank");
	});
});
