import { describe, expect, it } from "vitest";
import { findTransferLinks } from "./transfer-legs";

const expense = { transactionType: "Despesa", transferId: null };

describe("findTransferLinks", () => {
	it("ignora lancamentos que nao sao transferencia", () => {
		expect(findTransferLinks([expense])).toEqual({
			transferIds: [],
			hasUnlinkedTransfer: false,
		});
	});

	it("coleta cada transferencia uma vez, mesmo com as duas pernas pedidas", () => {
		expect(
			findTransferLinks([
				{ transactionType: "Transferência", transferId: "t1" },
				{ transactionType: "Transferência", transferId: "t1" },
				{ transactionType: "Transferência", transferId: "t2" },
				expense,
			]),
		).toEqual({ transferIds: ["t1", "t2"], hasUnlinkedTransfer: false });
	});

	it("sinaliza transferencia sem vinculo, que nao tem como achar a outra perna", () => {
		expect(
			findTransferLinks([
				{ transactionType: "Transferência", transferId: null },
			]).hasUnlinkedTransfer,
		).toBe(true);
	});
});
