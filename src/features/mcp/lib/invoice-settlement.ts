import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { cards, inboxItems } from "@/db/schema";
import { updateInvoicePaymentStatusAction } from "@/features/invoices/actions";
import { fetchInvoiceData } from "@/features/invoices/queries";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { fetchPluggyLinks } from "./inbox-approval";
import {
	type InvoiceCandidate,
	type InvoiceMatch,
	listCandidatePeriods,
	matchInvoicePayment,
} from "./invoice-match";

const CARD_LEG_FLAG = "pagamento_fatura_cartao";
const MAX_ITEMS = 50;

export type SettlementOutcome =
	| { id: string; status: "settled"; cardId: string; period: string }
	| { id: string; status: "discarded"; cardId: string; period: string }
	| {
			id: string;
			status: "would_settle" | "would_discard";
			cardId: string;
			period: string;
	  }
	| {
			id: string;
			status: "divergent";
			reason: string;
			amount: number;
			candidates: InvoiceCandidate[];
	  }
	| { id: string; status: "not_found" }
	| { id: string; status: "not_invoice_payment" }
	| { id: string; status: "already_decided"; currentStatus: string }
	| { id: string; status: "failed"; error: string };

async function fetchCandidates(
	userId: string,
	cardIds: string[],
	date: string,
): Promise<InvoiceCandidate[]> {
	const periods = listCandidatePeriods(date);
	const pairs = cardIds.flatMap((cardId) =>
		periods.map((period) => ({ cardId, period })),
	);

	return Promise.all(
		pairs.map(async ({ cardId, period }) => {
			// Total sempre calculado aqui: nunca vem do modelo.
			const invoice = await fetchInvoiceData(userId, cardId, period);
			return {
				cardId,
				period,
				total: Math.round(-invoice.totalAmount * 100) / 100,
				status: invoice.invoiceStatus,
				paymentDate: invoice.paymentDate,
			};
		}),
	);
}

const invoiceKey = (invoice: { cardId: string; period: string }) =>
	`${invoice.cardId}:${invoice.period}`;

function applySimulatedPayments(
	candidates: InvoiceCandidate[],
	payments: Map<string, Date>,
): InvoiceCandidate[] {
	return candidates.map((invoice) => {
		const paymentDate = payments.get(invoiceKey(invoice));
		return paymentDate ? { ...invoice, status: "pago", paymentDate } : invoice;
	});
}

async function discardItem(userId: string, id: string): Promise<boolean> {
	const now = new Date();
	const discarded = await db
		.update(inboxItems)
		.set({ status: "discarded", discardedAt: now, updatedAt: now })
		.where(
			and(
				eq(inboxItems.id, id),
				eq(inboxItems.userId, userId),
				eq(inboxItems.status, "pending"),
			),
		)
		.returning({ id: inboxItems.id });

	return discarded.length > 0;
}

async function restoreItem(userId: string, id: string): Promise<void> {
	await db
		.update(inboxItems)
		.set({ status: "pending", discardedAt: null, updatedAt: new Date() })
		.where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));
}

const DIVERGENCE_REASON: Record<
	Extract<InvoiceMatch, { candidates: unknown }>["kind"],
	string
> = {
	ambiguous: "Mais de uma fatura aberta tem este valor.",
	mismatch: "Nenhuma fatura bate com este valor.",
};

/**
 * Resolve itens de pagamento de fatura: o item nunca vira despesa. É descartado,
 * e a fatura é marcada como paga só quando o valor bate com o total calculado
 * no servidor. Divergência deixa o item pendente e volta no retorno.
 *
 * Roda em sequência, sem paralelismo: a segunda perna de um pagamento precisa
 * enxergar a fatura que a primeira acabou de quitar.
 */
export async function settleInvoicePaymentItems(
	userId: string,
	ids: string[] | undefined,
	dryRun: boolean,
): Promise<SettlementOutcome[]> {
	const rows = await db
		.select()
		.from(inboxItems)
		.where(
			and(
				eq(inboxItems.userId, userId),
				ids
					? inArray(inboxItems.id, ids)
					: and(
							eq(inboxItems.status, "pending"),
							isNotNull(inboxItems.pluggyFlag),
						),
			),
		)
		.limit(MAX_ITEMS);

	const itemsById = new Map(rows.map((row) => [row.id, row]));
	const targets = ids ?? rows.map((row) => row.id);

	const [links, userCards] = await Promise.all([
		fetchPluggyLinks(
			userId,
			rows.map((row) => row.pluggyAccountId),
		),
		db.select({ id: cards.id }).from(cards).where(eq(cards.userId, userId)),
	]);
	const allCardIds = userCards.map((card) => card.id);

	const outcomes: SettlementOutcome[] = [];
	// No dry_run nada grava: guarda aqui o que seria quitado, para a segunda
	// perna do mesmo pagamento simular o mesmo resultado da execução real.
	const simulatedPayments = new Map<string, Date>();

	for (const id of targets) {
		const item = itemsById.get(id);

		if (!item) {
			outcomes.push({ id, status: "not_found" });
			continue;
		}

		if (!item.pluggyFlag) {
			outcomes.push({ id, status: "not_invoice_payment" });
			continue;
		}

		if (!dryRun && item.status !== "pending") {
			outcomes.push({
				id,
				status: "already_decided",
				currentStatus: item.status,
			});
			continue;
		}

		const amount = Math.abs(Number(item.parsedAmount ?? 0));
		const date = (item.parsedDate ?? item.notificationTimestamp)
			.toISOString()
			.slice(0, 10);
		const link = item.pluggyAccountId
			? links.get(item.pluggyAccountId)
			: undefined;
		const isCardLeg = item.pluggyFlag === CARD_LEG_FLAG;
		const cardId = isCardLeg ? (link?.cardId ?? null) : null;

		if (isCardLeg && !cardId) {
			outcomes.push({
				id,
				status: "divergent",
				reason: "Cartão do pagamento não está vinculado.",
				amount,
				candidates: [],
			});
			continue;
		}

		const match = matchInvoicePayment({
			amount,
			date,
			cardId,
			candidates: applySimulatedPayments(
				await fetchCandidates(userId, cardId ? [cardId] : allCardIds, date),
				simulatedPayments,
			),
		});

		if (match.kind === "ambiguous" || match.kind === "mismatch") {
			outcomes.push({
				id,
				status: "divergent",
				reason: DIVERGENCE_REASON[match.kind],
				amount,
				candidates: match.candidates,
			});
			continue;
		}

		const { invoice } = match;
		const target = { cardId: invoice.cardId, period: invoice.period };

		if (dryRun) {
			if (match.kind === "settle") {
				simulatedPayments.set(
					invoiceKey(invoice),
					new Date(`${date}T00:00:00.000Z`),
				);
			}

			outcomes.push({
				id,
				status: match.kind === "settle" ? "would_settle" : "would_discard",
				...target,
			});
			continue;
		}

		if (!(await discardItem(userId, id))) {
			outcomes.push({
				id,
				status: "already_decided",
				currentStatus: "discarded",
			});
			continue;
		}

		if (match.kind === "already_paid") {
			outcomes.push({ id, status: "discarded", ...target });
			continue;
		}

		const result = await updateInvoicePaymentStatusAction({
			...target,
			status: INVOICE_PAYMENT_STATUS.PAID,
			paymentDate: date,
			paymentAccountId: isCardLeg ? undefined : link?.accountId,
		});

		if (!result.success) {
			await restoreItem(userId, id);
			outcomes.push({ id, status: "failed", error: result.error });
			continue;
		}

		outcomes.push({ id, status: "settled", ...target });
	}

	if (!dryRun) {
		revalidateForEntity("inbox", userId);
	}

	return outcomes;
}
