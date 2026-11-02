import type { McpServer } from "@modelcontextprotocol/server";
import { accountTools } from "./tools/accounts";
import { budgetTools } from "./tools/budgets";
import { cardTools } from "./tools/cards";
import { categoryTools } from "./tools/categories";
import { inboxTools } from "./tools/inbox";
import { insightTools } from "./tools/insights";
import { invoiceTools } from "./tools/invoices";
import { noteTools } from "./tools/notes";
import { openFinanceTools } from "./tools/open-finance";
import { overviewTools } from "./tools/overview";
import { payerTools } from "./tools/payers";
import { systemTools } from "./tools/system";
import { transactionTools } from "./tools/transactions";

export const MCP_INSTRUCTIONS = `Gerencia as finanças pessoais do usuário no OpenMonetis.

Para processar a inbox: consulte get_decision_history, resolva pagamentos de fatura com settle_invoice_payment_items, aprove com approve_inbox_items apenas o que tiver padrão claro no histórico e deixe o resto pendente para o usuário.

Pagamento de fatura nunca vira despesa. Parcelas ficam para revisão manual.`;

const TOOL_GROUPS = [
	systemTools,
	inboxTools,
	transactionTools,
	invoiceTools,
	accountTools,
	cardTools,
	categoryTools,
	budgetTools,
	payerTools,
	noteTools,
	overviewTools,
	openFinanceTools,
	insightTools,
];

export function registerMcpTools(server: McpServer): void {
	for (const group of TOOL_GROUPS) {
		for (const register of group) {
			register(server);
		}
	}
}
