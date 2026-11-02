import { z } from "zod";
import {
	adjustInvoiceAction,
	updateInvoicePaymentStatusAction,
	updatePaymentDateAction,
} from "@/features/invoices/actions";
import { fetchCardData, fetchInvoiceData } from "@/features/invoices/queries";
import { defineTool } from "../lib/define-tool";
import { isoDate, period, uuid } from "./schemas";

export const invoiceTools = [
	defineTool({
		name: "get_invoice",
		title: "Ver fatura",
		description:
			"Devolve total, status e data de pagamento da fatura do cartão.",
		kind: "read",
		input: z.object({ cardId: uuid(), period: period() }),
		handler: async ({ cardId, period: selected }, { userId }) => {
			const card = await fetchCardData(userId, cardId);

			if (!card) {
				return { success: false, error: "Cartão não encontrado." };
			}

			const invoice = await fetchInvoiceData(userId, cardId, selected);

			return {
				cardId,
				cardName: card.name,
				period: selected,
				closingDay: card.closingDay,
				dueDay: card.dueDay,
				...invoice,
			};
		},
	}),

	defineTool({
		name: "update_invoice_payment_status",
		title: "Pagar ou reverter fatura",
		description:
			"Marca a fatura como paga, criando o lançamento de pagamento, ou reverte o pagamento.",
		kind: "write",
		input: z.object({
			cardId: uuid(),
			period: period(),
			status: z.enum(["pago", "pendente"]),
			paymentDate: isoDate().optional(),
			paymentAccountId: uuid().optional(),
		}),
		handler: (args) => updateInvoicePaymentStatusAction(args),
	}),

	defineTool({
		name: "update_invoice_payment_date",
		title: "Alterar data do pagamento da fatura",
		description: "Altera a data do pagamento de uma fatura paga.",
		kind: "write",
		input: z.object({
			cardId: uuid(),
			period: period(),
			paymentDate: isoDate(),
		}),
		handler: (args) => updatePaymentDateAction(args),
	}),

	defineTool({
		name: "adjust_invoice",
		title: "Ajustar fatura",
		description:
			"Cria o lançamento de ajuste para a fatura chegar ao valor informado. O total atual é calculado no servidor.",
		kind: "write",
		input: z.object({
			cardId: uuid(),
			period: period(),
			targetAmount: z.number().min(0),
		}),
		handler: async ({ cardId, period: selected, targetAmount }, { userId }) => {
			const { totalAmount } = await fetchInvoiceData(userId, cardId, selected);

			return adjustInvoiceAction({
				cardId,
				period: selected,
				currentTotal: totalAmount,
				targetAmount,
			});
		},
	}),
];
