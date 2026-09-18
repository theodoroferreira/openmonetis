import type {
	PluggyAccount,
	PluggyTransaction,
} from "@/shared/lib/pluggy/schemas";
import { slugify } from "@/shared/utils/string";

export type PluggyInvoicePaymentFlag =
	| "pagamento_fatura_cartao"
	| "pagamento_fatura_conta";

/** Padroes de descricao usados para identificar a perna da conta corrente. */
export const INVOICE_PAYMENT_DESCRIPTION_PATTERNS = [
	"PAGAMENTO FATURA",
	"PAGAMENTO DE FATURA",
	"PAGTO CARTAO",
	"PAG FATURA",
	"PAGAMENTO CARTAO CREDITO",
] as const;

const NORMALIZED_INVOICE_PAYMENT_PATTERNS =
	INVOICE_PAYMENT_DESCRIPTION_PATTERNS.map(slugify);

function matchesInvoicePaymentDescription(description: string): boolean {
	const normalized = slugify(description);
	return NORMALIZED_INVOICE_PAYMENT_PATTERNS.some((pattern) =>
		normalized.includes(pattern),
	);
}

/**
 * Detecta a perna de pagamento de fatura (cartao ou conta corrente) de uma
 * transacao do Pluggy. Funcao pura — nao decide descarte, so o flag.
 */
export function detectInvoicePaymentFlag(
	transaction: PluggyTransaction,
	accountType: PluggyAccount["type"],
): PluggyInvoicePaymentFlag | null {
	const description = transaction.descriptionRaw ?? transaction.description;

	if (accountType === "CREDIT") {
		if (transaction.type !== "CREDIT") return null;
		if (transaction.operationType === "ESTORNO") return null;
		if (transaction.operationType === "PAGAMENTO_FATURA") {
			return "pagamento_fatura_cartao";
		}
		return matchesInvoicePaymentDescription(description)
			? "pagamento_fatura_cartao"
			: null;
	}

	if (
		transaction.type === "DEBIT" &&
		matchesInvoicePaymentDescription(description)
	) {
		return "pagamento_fatura_conta";
	}

	return null;
}
