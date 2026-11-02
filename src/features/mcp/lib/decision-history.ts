import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import { normalizeOfxIdentityText } from "@/shared/lib/import/ofx-identity";

export type HistoryInboxRow = {
	name: string | null;
	status: "processed" | "discarded";
};

export type HistoryTransactionRow = {
	name: string;
	amount: string;
	categoryId: string | null;
	categoryName: string | null;
	accountId: string | null;
	accountName: string | null;
	cardId: string | null;
	cardName: string | null;
	paymentMethod: string;
	payerId: string | null;
	payerName: string | null;
	condition: string;
	purchaseDate: Date;
};

type Tally<T> = T & { count: number };

export type DecisionGroup = {
	key: string;
	name: string;
	inbox: { processed: number; discarded: number };
	transactions: number;
	amount: { min: number; max: number; average: number } | null;
	lastDate: string | null;
	categories: Tally<{ id: string; name: string | null }>[];
	destinations: Tally<{
		type: "account" | "card";
		id: string;
		name: string | null;
	}>[];
	paymentMethods: Tally<{ value: string }>[];
	payers: Tally<{ id: string; name: string | null }>[];
	conditions: Tally<{ value: string }>[];
};

type MutableGroup = {
	key: string;
	name: string;
	processed: number;
	discarded: number;
	amounts: number[];
	lastDate: string | null;
	categories: Map<string, DecisionGroup["categories"][number]>;
	destinations: Map<string, DecisionGroup["destinations"][number]>;
	paymentMethods: Map<string, DecisionGroup["paymentMethods"][number]>;
	payers: Map<string, DecisionGroup["payers"][number]>;
	conditions: Map<string, DecisionGroup["conditions"][number]>;
};

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

/** Janela `[start, end)` em datas ISO; o dia é limitado ao fim do mês alvo. */
export function resolveHistoryWindow(
	months: number,
	before: string | undefined,
	today: Date,
): { start: string; end: string } {
	const end = before ?? toDateOnly(today);
	const [year = 0, month = 1, day = 1] = end.split("-").map(Number);
	const lastDayOfTarget = new Date(
		Date.UTC(year, month - 1 - months + 1, 0),
	).getUTCDate();
	const start = new Date(
		Date.UTC(year, month - 1 - months, Math.min(day, lastDayOfTarget)),
	);

	return { start: toDateOnly(start), end };
}

/** Parcelas da mesma compra caem no mesmo grupo. */
function buildKey(name: string): string {
	const detected = detectInstallmentFromName(name);
	return normalizeOfxIdentityText(detected?.name ?? name);
}

function tally<T extends object>(
	map: Map<string, Tally<T>>,
	key: string,
	value: T,
) {
	const current = map.get(key);
	if (current) {
		current.count += 1;
		return;
	}
	map.set(key, { ...value, count: 1 });
}

const sortByCount = <T extends { count: number }>(map: Map<string, T>): T[] =>
	[...map.values()].sort((a, b) => b.count - a.count);

const round = (value: number) => Math.round(value * 100) / 100;

function getGroup(
	groups: Map<string, MutableGroup>,
	name: string,
): MutableGroup {
	const key = buildKey(name);
	const existing = groups.get(key);
	if (existing) return existing;

	const created: MutableGroup = {
		key,
		name: name.trim(),
		processed: 0,
		discarded: 0,
		amounts: [],
		lastDate: null,
		categories: new Map(),
		destinations: new Map(),
		paymentMethods: new Map(),
		payers: new Map(),
		conditions: new Map(),
	};
	groups.set(key, created);
	return created;
}

/**
 * Resume as decisões do período por descrição normalizada. A ligação entre
 * item e lançamento é só pelo texto, porque `lancamento_id` nunca foi
 * preenchido no histórico.
 */
export function groupDecisionHistory(
	inboxRows: HistoryInboxRow[],
	transactionRows: HistoryTransactionRow[],
): DecisionGroup[] {
	const groups = new Map<string, MutableGroup>();

	for (const row of inboxRows) {
		if (!row.name?.trim()) continue;

		const group = getGroup(groups, row.name);
		if (row.status === "processed") group.processed += 1;
		else group.discarded += 1;
	}

	for (const row of transactionRows) {
		if (!row.name.trim()) continue;

		const group = getGroup(groups, row.name);
		group.amounts.push(Math.abs(Number(row.amount)));

		const date = toDateOnly(row.purchaseDate);
		if (!group.lastDate || date > group.lastDate) group.lastDate = date;

		if (row.categoryId) {
			tally(group.categories, row.categoryId, {
				id: row.categoryId,
				name: row.categoryName,
			});
		}
		if (row.cardId) {
			tally(group.destinations, `card:${row.cardId}`, {
				type: "card" as const,
				id: row.cardId,
				name: row.cardName,
			});
		} else if (row.accountId) {
			tally(group.destinations, `account:${row.accountId}`, {
				type: "account" as const,
				id: row.accountId,
				name: row.accountName,
			});
		}
		if (row.payerId) {
			tally(group.payers, row.payerId, {
				id: row.payerId,
				name: row.payerName,
			});
		}
		tally(group.paymentMethods, row.paymentMethod, {
			value: row.paymentMethod,
		});
		tally(group.conditions, row.condition, { value: row.condition });
	}

	return [...groups.values()]
		.map((group) => ({
			key: group.key,
			name: group.name,
			inbox: { processed: group.processed, discarded: group.discarded },
			transactions: group.amounts.length,
			amount:
				group.amounts.length > 0
					? {
							min: Math.min(...group.amounts),
							max: Math.max(...group.amounts),
							average: round(
								group.amounts.reduce((sum, value) => sum + value, 0) /
									group.amounts.length,
							),
						}
					: null,
			lastDate: group.lastDate,
			categories: sortByCount(group.categories),
			destinations: sortByCount(group.destinations),
			paymentMethods: sortByCount(group.paymentMethods),
			payers: sortByCount(group.payers),
			conditions: sortByCount(group.conditions),
		}))
		.sort(
			(a, b) =>
				b.transactions +
				b.inbox.processed +
				b.inbox.discarded -
				(a.transactions + a.inbox.processed + a.inbox.discarded),
		);
}
