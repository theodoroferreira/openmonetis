import { describe, expect, it } from "vitest";
import {
	groupDecisionHistory,
	type HistoryInboxRow,
	type HistoryTransactionRow,
	resolveHistoryWindow,
} from "./decision-history";

const tx = (
	overrides: Partial<HistoryTransactionRow>,
): HistoryTransactionRow => ({
	name: "Spotify",
	amount: "-21.90",
	categoryId: "cat",
	categoryName: "Assinaturas",
	accountId: null,
	accountName: null,
	cardId: "card",
	cardName: "Nubank",
	paymentMethod: "Cartão de crédito",
	payerId: "payer",
	payerName: "Eu",
	condition: "À vista",
	purchaseDate: new Date("2026-10-01T00:00:00.000Z"),
	...overrides,
});

const inbox = (overrides: Partial<HistoryInboxRow>): HistoryInboxRow => ({
	name: "SPOTIFY",
	status: "processed",
	...overrides,
});

describe("resolveHistoryWindow", () => {
	it("volta os meses pedidos a partir de before", () => {
		expect(resolveHistoryWindow(3, "2026-11-02", new Date())).toEqual({
			start: "2026-08-02",
			end: "2026-11-02",
		});
	});

	it("usa hoje quando before nao vem", () => {
		expect(
			resolveHistoryWindow(1, undefined, new Date("2026-03-31T12:00:00Z")),
		).toEqual({ start: "2026-02-28", end: "2026-03-31" });
	});
});

describe("groupDecisionHistory", () => {
	it("liga item e lancamento pela descricao normalizada", () => {
		const [group] = groupDecisionHistory(
			[inbox({}), inbox({ name: "  spotify " })],
			[tx({}), tx({ name: "SPOTIFY", amount: "-23.90" })],
		);

		expect(group).toMatchObject({
			key: "spotify",
			inbox: { processed: 2, discarded: 0 },
			transactions: 2,
			amount: { min: 21.9, max: 23.9, average: 22.9 },
			categories: [{ id: "cat", name: "Assinaturas", count: 2 }],
			destinations: [{ type: "card", id: "card", name: "Nubank", count: 2 }],
			paymentMethods: [{ value: "Cartão de crédito", count: 2 }],
			conditions: [{ value: "À vista", count: 2 }],
			lastDate: "2026-10-01",
		});
	});

	it("conta descartados e ordena opcoes pela frequencia", () => {
		const [group] = groupDecisionHistory(
			[inbox({ status: "discarded" })],
			[
				tx({ categoryId: "a", categoryName: "A" }),
				tx({ categoryId: "b", categoryName: "B" }),
				tx({ categoryId: "b", categoryName: "B" }),
			],
		);

		expect(group?.inbox).toEqual({ processed: 0, discarded: 1 });
		expect(group?.categories.map((category) => category.id)).toEqual([
			"b",
			"a",
		]);
	});

	it("agrupa parcelas da mesma compra", () => {
		const groups = groupDecisionHistory(
			[],
			[tx({ name: "Loja X 1/10" }), tx({ name: "Loja X 2/10" })],
		);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.key).toBe("loja x");
	});

	it("ordena grupos pelo volume e ignora nomes vazios", () => {
		const groups = groupDecisionHistory(
			[inbox({ name: null }), inbox({ name: "Raro" })],
			[tx({}), tx({})],
		);

		expect(groups.map((group) => group.key)).toEqual(["spotify", "raro"]);
	});
});
