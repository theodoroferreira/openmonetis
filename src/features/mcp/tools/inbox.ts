import { z } from "zod";
import {
	bulkDeleteSelectedInboxItemsAction,
	bulkDiscardInboxItemsAction,
	restoreDiscardedInboxItemAction,
} from "@/features/inbox/actions";
import {
	fetchInboxItemsPage,
	fetchInboxStatusCounts,
} from "@/features/inbox/queries";
import { fetchDecisionHistory } from "../lib/decision-history-query";
import { defineTool } from "../lib/define-tool";
import {
	approveInboxItems,
	fetchPluggyLinks,
	undoInboxApproval,
} from "../lib/inbox-approval";
import { settleInvoicePaymentItems } from "../lib/invoice-settlement";
import {
	dryRun,
	isoDate,
	pagination,
	paymentMethod,
	period,
	transactionType,
	uuid,
} from "./schemas";

const MAX_BATCH = 50;

const approvalOverrides = z.object({
	name: z.string().min(1).optional(),
	categoryId: uuid().optional(),
	accountId: uuid().optional(),
	cardId: uuid().optional(),
	payerId: uuid().optional(),
	paymentMethod: paymentMethod().optional(),
	transactionType: transactionType().optional(),
	purchaseDate: isoDate().optional(),
	period: period().optional(),
	note: z.string().max(500).optional(),
	isSettled: z.boolean().optional(),
});

export const inboxTools = [
	defineTool({
		name: "list_inbox",
		title: "Listar inbox",
		description:
			"Lista itens da inbox por status. `pluggyFlag` preenchido indica pagamento de fatura, que nunca vira lançamento.",
		kind: "read",
		input: z.object({
			status: z.enum(["pending", "processed", "discarded"]).default("pending"),
			sourceApp: z.string().optional(),
			...pagination,
		}),
		handler: async ({ status, sourceApp, page, pageSize }, { userId }) => {
			const [{ items, pagination: pageInfo }, counts] = await Promise.all([
				fetchInboxItemsPage(userId, status, { page, pageSize, sourceApp }),
				fetchInboxStatusCounts(userId),
			]);
			const links = await fetchPluggyLinks(
				userId,
				items.map((item) => item.pluggyAccountId),
			);

			return {
				counts,
				pagination: pageInfo,
				items: items.map((item) => {
					const link = item.pluggyAccountId
						? links.get(item.pluggyAccountId)
						: undefined;

					return {
						id: item.id,
						status: item.status,
						source: item.sourceAppName ?? item.sourceApp,
						originalText: item.originalText,
						name: item.parsedName,
						amount: item.parsedAmount,
						transactionType: item.parsedTransactionType,
						date: item.parsedDate ?? item.notificationTimestamp,
						period: item.parsedPeriod,
						paymentMethod: item.parsedPaymentMethod,
						categoryId: item.parsedCategoryId,
						accountId: link?.accountId ?? item.parsedAccountId,
						cardId: link?.cardId ?? item.parsedCardId,
						installmentCount: item.parsedInstallmentCount,
						currentInstallment: item.parsedCurrentInstallment,
						currency: item.parsedCurrency,
						originAmount: item.parsedOriginAmount,
						exchangeRate: item.parsedExchangeRate,
						pluggyFlag: item.pluggyFlag,
						transactionId: item.transactionId,
					};
				}),
			};
		},
	}),

	defineTool({
		name: "get_decision_history",
		title: "Histórico de decisões",
		description:
			"Resume, por descrição, como itens parecidos foram tratados nos últimos meses: contagens de categoria, conta ou cartão, forma de pagamento, pessoa e condição. `before` limita a janela para teste retroativo.",
		kind: "read",
		input: z.object({
			months: z.number().int().min(1).max(24).default(3),
			before: isoDate().optional(),
		}),
		handler: ({ months, before }, { userId }) =>
			fetchDecisionHistory(userId, months, before),
	}),

	defineTool({
		name: "approve_inbox_items",
		title: "Aprovar itens da inbox",
		description:
			"Cria lançamentos a partir de itens pendentes, com resultado por item. Recusa pagamento de fatura e parcelas, que continuam pendentes. Com dry_run, simula e aceita itens já decididos.",
		kind: "write",
		input: z.object({
			items: z
				.array(
					z.object({ id: uuid(), overrides: approvalOverrides.optional() }),
				)
				.min(1)
				.max(MAX_BATCH),
			dry_run: dryRun(),
		}),
		handler: async ({ items, dry_run }, { userId, audit }) => {
			const results = await approveInboxItems(userId, items, dry_run);
			const created = results.filter((result) => result.status === "created");

			audit({
				affectedIds: created.map((item) => item.id),
				dryRun: dry_run,
				summary: dry_run
					? `Simulação de ${results.length} item(ns).`
					: `${created.length} de ${results.length} item(ns) aprovado(s).`,
			});

			return { approved: created.length, total: results.length, results };
		},
	}),

	defineTool({
		name: "settle_invoice_payment_items",
		title: "Resolver pagamentos de fatura",
		description:
			"Trata itens de pagamento de fatura (pluggyFlag). O item é descartado e a fatura marcada como paga quando o valor bate com o total calculado no servidor. Divergência fica pendente e volta no retorno para o resumo. Sem ids, trata todos os pendentes.",
		kind: "write",
		input: z.object({
			ids: z.array(uuid()).min(1).max(MAX_BATCH).optional(),
			dry_run: dryRun(),
		}),
		handler: async ({ ids, dry_run }, { userId, audit }) => {
			const results = await settleInvoicePaymentItems(userId, ids, dry_run);

			const resolved = results.filter(
				(result) =>
					result.status === "settled" || result.status === "discarded",
			);

			audit({
				affectedIds: resolved.map((result) => result.id),
				dryRun: dry_run,
				summary: dry_run
					? `Simulação de ${results.length} pagamento(s) de fatura.`
					: `${resolved.length} de ${results.length} pagamento(s) de fatura resolvido(s).`,
			});

			return { results };
		},
	}),

	defineTool({
		name: "undo_inbox_approval",
		title: "Desfazer aprovação",
		description:
			"Apaga o lançamento criado por approve_inbox_items e devolve o item para pendente.",
		kind: "destructive",
		input: z.object({ id: uuid() }),
		handler: async ({ id }, { userId, audit }) => {
			const result = await undoInboxApproval(userId, id);

			if (!result.success) return result;

			audit({ affectedIds: [id], snapshot: result.data?.snapshot });
			return { success: true, message: result.message };
		},
	}),

	defineTool({
		name: "discard_inbox_items",
		title: "Descartar itens da inbox",
		description: "Descarta itens pendentes que não devem virar lançamento.",
		kind: "write",
		input: z.object({ ids: z.array(uuid()).min(1).max(MAX_BATCH) }),
		handler: async ({ ids }, { audit }) => {
			audit({ affectedIds: ids });
			return bulkDiscardInboxItemsAction({ inboxItemIds: ids });
		},
	}),

	defineTool({
		name: "restore_inbox_item",
		title: "Restaurar item descartado",
		description: "Devolve um item descartado para pendente.",
		kind: "write",
		input: z.object({ id: uuid() }),
		handler: async ({ id }, { audit }) => {
			audit({ affectedIds: [id] });
			return restoreDiscardedInboxItemAction({ inboxItemId: id });
		},
	}),

	defineTool({
		name: "delete_inbox_items",
		title: "Excluir itens da inbox",
		description:
			"Exclui de vez itens já processados ou descartados. Itens pendentes não são excluídos.",
		kind: "destructive",
		input: z.object({ ids: z.array(uuid()).min(1).max(MAX_BATCH) }),
		handler: async ({ ids }, { audit }) => {
			audit({ affectedIds: ids });
			return bulkDeleteSelectedInboxItemsAction({ inboxItemIds: ids });
		},
	}),
];
