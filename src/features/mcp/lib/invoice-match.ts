import type { InvoicePaymentStatus } from "@/shared/lib/invoices";
import { addMonthsToPeriod } from "@/shared/utils/period";

export type InvoiceCandidate = {
	cardId: string;
	period: string;
	/** Valor a pagar, positivo. */
	total: number;
	status: InvoicePaymentStatus;
	paymentDate: Date | null;
};

export type InvoiceMatch =
	| { kind: "settle"; invoice: InvoiceCandidate }
	| { kind: "already_paid"; invoice: InvoiceCandidate }
	| { kind: "ambiguous"; candidates: InvoiceCandidate[] }
	| { kind: "mismatch"; candidates: InvoiceCandidate[] };

const AMOUNT_TOLERANCE = 0.01;
/** Janela para considerar duas pernas como o mesmo pagamento. */
const SAME_PAYMENT_DAYS = 5;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Fatura vence perto do pagamento: mês anterior, atual e seguinte. */
export function listCandidatePeriods(date: string): string[] {
	const period = date.slice(0, 7);
	return [addMonthsToPeriod(period, -1), period, addMonthsToPeriod(period, 1)];
}

const amountsMatch = (a: number, b: number) =>
	Math.abs(a - b) <= AMOUNT_TOLERANCE + Number.EPSILON;

function isSamePayment(invoice: InvoiceCandidate, date: string): boolean {
	if (!invoice.paymentDate) return false;

	const distance = Math.abs(
		invoice.paymentDate.getTime() - new Date(`${date}T00:00:00.000Z`).getTime(),
	);
	return distance <= SAME_PAYMENT_DAYS * DAY_IN_MS;
}

/**
 * Decide o que fazer com um item de pagamento de fatura. `cardId` nulo é a
 * perna da conta corrente, que não diz de qual cartão é: nesse caso só uma
 * fatura aberta pode bater em valor.
 *
 * A checagem de fatura paga vem antes da aberta: as duas pernas do mesmo
 * pagamento chegam como itens separados, e a segunda não pode liquidar a
 * fatura do mês seguinte só porque o valor é igual.
 */
export function matchInvoicePayment({
	amount,
	date,
	cardId,
	candidates,
}: {
	amount: number;
	date: string;
	cardId: string | null;
	candidates: InvoiceCandidate[];
}): InvoiceMatch {
	const scoped = candidates.filter(
		(invoice) =>
			invoice.total > 0 && (cardId === null || invoice.cardId === cardId),
	);
	const matching = scoped.filter((invoice) =>
		amountsMatch(invoice.total, amount),
	);
	const paid = matching.filter((invoice) => invoice.status === "pago");
	const open = matching.filter((invoice) => invoice.status !== "pago");

	const samePayment = paid.find((invoice) => isSamePayment(invoice, date));
	if (samePayment) {
		return { kind: "already_paid", invoice: samePayment };
	}

	if (open.length > 1) {
		return { kind: "ambiguous", candidates: open };
	}

	const [singleOpen] = open;
	if (singleOpen) {
		return { kind: "settle", invoice: singleOpen };
	}

	const [anyPaid] = paid;
	if (anyPaid) {
		return { kind: "already_paid", invoice: anyPaid };
	}

	return { kind: "mismatch", candidates: scoped };
}
