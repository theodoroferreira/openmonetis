import { and, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { transactions } from "@/db/schema";
import {
	convertTransactionToInstallmentAction,
	convertTransactionToRecurringAction,
	createTransactionAction,
	deleteMultipleTransactionsAction,
	deleteTransactionAction,
	deleteTransactionBulkAction,
	fetchExchangeRateAction,
	toggleTransactionSettlementAction,
	updateTransactionAction,
	updateTransactionBulkAction,
	updateTransactionSplitPairAction,
} from "@/features/transactions/actions";
import {
	cancelInstallmentAnticipationAction,
	createInstallmentAnticipationAction,
	getEligibleInstallmentsAction,
} from "@/features/transactions/actions/anticipation";
import { fetchTransactionByIdAction } from "@/features/transactions/actions/fetch-by-id";
import { refundTransactionAction } from "@/features/transactions/actions/refund-action";
import {
	buildTransactionWhere,
	type TransactionSearchFilters,
} from "@/features/transactions/lib/page-helpers";
import { fetchTransactionsPage } from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";
import { getCurrentPeriod } from "@/shared/utils/period";
import { snapshotTransactions } from "../lib/cascade-snapshot";
import { defineTool } from "../lib/define-tool";
import {
	isEditableByTool,
	mergeSeriesUpdate,
	mergeTransactionUpdate,
} from "../lib/transaction-update";
import { expandTransferLegs } from "../lib/transfer-legs";
import {
	isoDate,
	pagination,
	paymentMethod,
	period,
	transactionCondition,
	transactionFields,
	transactionInput,
	uuid,
} from "./schemas";
import {
	buildTransactionInput,
	resolveTransactionPeriod,
} from "./transaction-input";

const MAX_BATCH = 50;

const { splitShares: _splitShares, ...editableFields } = transactionFields;
const updatableTransactionFields = z.object(editableFields).partial().shape;

const scope = () =>
	z
		.enum(["current", "period", "future", "all"])
		.describe("Alcance na série: só este, o mês, este e os futuros, ou todos.");

const EMPTY_FILTERS: TransactionSearchFilters = {
	transactionFilter: null,
	conditionFilters: [],
	paymentFilters: [],
	payerFilters: [],
	categoryFilters: [],
	accountCardFilters: [],
	searchFilter: null,
	settledFilter: null,
	attachmentFilter: null,
	dividedFilter: null,
	amountMinFilter: null,
	amountMaxFilter: null,
	dateStartFilter: null,
	dateEndFilter: null,
};

const NO_SLUGS = {
	payer: new Map<string, string>(),
	category: new Map<string, string>(),
	financialAccount: new Map<string, string>(),
	card: new Map<string, string>(),
};

const snapshotById = (userId: string, id: string) =>
	snapshotTransactions(userId, eq(transactions.id, id));

export const transactionTools = [
	defineTool({
		name: "list_transactions",
		title: "Listar lançamentos",
		description:
			"Lista lançamentos do período, ou do intervalo de datas quando informado, com filtros opcionais.",
		kind: "read",
		input: z.object({
			period: period().optional(),
			dateStart: isoDate().optional(),
			dateEnd: isoDate().optional(),
			search: z.string().optional(),
			transactionType: z
				.enum(["Despesa", "Receita", "Transferência"])
				.optional(),
			condition: transactionCondition().optional(),
			paymentMethod: paymentMethod().optional(),
			categoryId: uuid().optional(),
			accountId: uuid().optional(),
			cardId: uuid().optional(),
			payerId: uuid().optional(),
			...pagination,
		}),
		handler: async (args, { userId }) => {
			const where: SQL[] = buildTransactionWhere({
				userId,
				period: args.period ?? getCurrentPeriod(),
				filters: {
					...EMPTY_FILTERS,
					searchFilter: args.search ?? null,
					dateStartFilter: args.dateStart ?? null,
					dateEndFilter: args.dateEnd ?? null,
				},
				slugMaps: NO_SLUGS,
				accountId: args.accountId,
				cardId: args.cardId,
				payerId: args.payerId,
			});

			if (args.transactionType) {
				where.push(eq(transactions.transactionType, args.transactionType));
			}
			if (args.condition) {
				where.push(eq(transactions.condition, args.condition));
			}
			if (args.paymentMethod) {
				where.push(eq(transactions.paymentMethod, args.paymentMethod));
			}
			if (args.categoryId) {
				where.push(eq(transactions.categoryId, args.categoryId));
			}

			const page = await fetchTransactionsPage(where, {
				page: args.page,
				pageSize: args.pageSize,
			});

			return {
				pagination: {
					page: page.page,
					pageSize: page.pageSize,
					totalItems: page.totalItems,
					totalPages: page.totalPages,
				},
				items: page.rows.map((row) => ({
					id: row.id,
					name: row.name,
					amount: row.amount,
					purchaseDate: row.purchaseDate,
					period: row.period,
					transactionType: row.transactionType,
					condition: row.condition,
					paymentMethod: row.paymentMethod,
					isSettled: row.isSettled,
					note: row.note,
					category: row.category?.name ?? null,
					categoryId: row.categoryId,
					account: row.financialAccount?.name ?? null,
					accountId: row.accountId,
					card: row.card?.name ?? null,
					cardId: row.cardId,
					payer: row.payer?.name ?? null,
					payerId: row.payerId,
					seriesId: row.seriesId,
					splitGroupId: row.splitGroupId,
					installmentCount: row.installmentCount,
					currentInstallment: row.currentInstallment,
				})),
			};
		},
	}),

	defineTool({
		name: "get_transaction",
		title: "Ver lançamento",
		description: "Devolve um lançamento pelo ID.",
		kind: "read",
		input: z.object({ id: uuid() }),
		handler: ({ id }) => fetchTransactionByIdAction(id),
	}),

	defineTool({
		name: "get_exchange_rate",
		title: "Consultar cotação",
		description: "Busca a cotação de uma moeda em BRL para a data informada.",
		kind: "read",
		input: z.object({ currency: z.string().length(3), date: isoDate() }),
		handler: ({ currency, date }) =>
			fetchExchangeRateAction({ currency, date }),
	}),

	defineTool({
		name: "create_transaction",
		title: "Criar lançamento",
		description:
			"Cria um lançamento. Transferência entre contas tem ferramenta própria (transfer_between_accounts). Para itens da inbox use approve_inbox_items.",
		kind: "write",
		input: transactionInput,
		handler: async (args, { userId, audit }) => {
			const result = await createTransactionAction(
				await buildTransactionInput(userId, args),
			);

			if (result.success) audit({ affectedIds: result.data?.ids });
			return result;
		},
	}),

	defineTool({
		name: "create_transactions",
		title: "Criar lançamentos em lote",
		description:
			"Cria vários lançamentos, um a um, com as mesmas validações de create_transaction e resultado por item.",
		kind: "write",
		input: z.object({
			transactions: z.array(transactionInput).min(1).max(MAX_BATCH),
		}),
		handler: async ({ transactions: inputs }, { userId, audit }) => {
			const results: Array<
				{ index: number; ids: string[] } | { index: number; error: string }
			> = [];

			// Em sequência, para cada validação de limite enxergar a anterior.
			for (const [index, input] of inputs.entries()) {
				const result = await createTransactionAction(
					await buildTransactionInput(userId, input),
				);

				results.push(
					result.success
						? { index, ids: result.data?.ids ?? [] }
						: { index, error: result.error },
				);
			}

			audit({
				affectedIds: results.flatMap((result) =>
					"ids" in result ? result.ids : [],
				),
			});

			return { results };
		},
	}),

	defineTool({
		name: "update_transaction",
		title: "Editar lançamento",
		description:
			"Edita um lançamento: informe só o que muda, o resto é preservado. Se ele fizer parte de uma divisão, atualiza também a outra parte. Para editar uma série inteira use update_transaction_series.",
		kind: "write",
		input: z.object({
			id: uuid(),
			...updatableTransactionFields,
			note: z.string().max(500).nullable().optional(),
		}),
		handler: async ({ id, ...changes }, { userId, audit }) => {
			const existing = await db.query.transactions.findFirst({
				where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
			});

			if (!existing) {
				return { success: false, error: "Lançamento não encontrado." };
			}

			if (!isEditableByTool(existing)) {
				return {
					success: false,
					error: "Transferências não podem ser editadas por esta ferramenta.",
				};
			}

			audit({ affectedIds: [id], snapshot: { transaction: existing } });

			const merged = mergeTransactionUpdate(existing, changes);
			const input = {
				...merged,
				id,
				period: await resolveTransactionPeriod(userId, merged),
			};

			return existing.splitGroupId
				? updateTransactionSplitPairAction(input)
				: updateTransactionAction(input);
		},
	}),

	defineTool({
		name: "update_transaction_series",
		title: "Editar série de lançamentos",
		description:
			"Edita lançamentos parcelados ou recorrentes conforme o alcance. Informe só o que muda: o resto é preservado. Mudar o valor apaga o câmbio de origem.",
		kind: "write",
		input: z.object({
			id: uuid(),
			scope: scope(),
			name: z.string().min(1).optional(),
			amount: z.number().min(0).optional(),
			purchaseDate: isoDate().optional(),
			period: period().optional(),
			categoryId: uuid().optional(),
			payerId: uuid().optional(),
			accountId: uuid().optional(),
			cardId: uuid().optional(),
			note: z.string().max(500).nullable().optional(),
			dueDate: isoDate().optional(),
			boletoPaymentDate: isoDate().optional(),
			isSettled: z.boolean().optional(),
		}),
		handler: async (args, { audit, userId }) => {
			const existing = await db.query.transactions.findFirst({
				where: and(
					eq(transactions.id, args.id),
					eq(transactions.userId, userId),
				),
			});

			if (!existing) {
				return { success: false, error: "Lançamento não encontrado." };
			}

			audit({
				affectedIds: [args.id],
				snapshot: await snapshotTransactions(
					userId,
					existing.seriesId
						? eq(transactions.seriesId, existing.seriesId)
						: eq(transactions.id, args.id),
				),
			});

			return updateTransactionBulkAction(mergeSeriesUpdate(existing, args));
		},
	}),

	defineTool({
		name: "delete_transaction",
		title: "Excluir lançamento",
		description:
			"Exclui um lançamento. Em transferência, exclui as duas pernas. Pagamento automático de fatura e saldo inicial são protegidos.",
		kind: "destructive",
		input: z.object({ id: uuid() }),
		handler: async ({ id }, { audit, userId }) => {
			const expansion = await expandTransferLegs(userId, [id]);

			if (!expansion.ok) {
				return { success: false, error: expansion.error };
			}

			audit({
				affectedIds: expansion.ids,
				snapshot: await snapshotTransactions(
					userId,
					inArray(transactions.id, expansion.ids),
				),
			});

			// Um único DELETE: as duas pernas somem juntas ou nenhuma some.
			return expansion.includesTransfer
				? deleteMultipleTransactionsAction({ ids: expansion.ids })
				: deleteTransactionAction({ id });
		},
	}),

	defineTool({
		name: "delete_transactions",
		title: "Excluir lançamentos em lote",
		description:
			"Exclui vários lançamentos pelos IDs. Em transferência, exclui as duas pernas.",
		kind: "destructive",
		input: z.object({ ids: z.array(uuid()).min(1).max(MAX_BATCH) }),
		handler: async ({ ids }, { audit, userId }) => {
			const expansion = await expandTransferLegs(userId, ids);

			if (!expansion.ok) {
				return { success: false, error: expansion.error };
			}

			audit({
				affectedIds: expansion.ids,
				snapshot: await snapshotTransactions(
					userId,
					inArray(transactions.id, expansion.ids),
				),
			});

			return deleteMultipleTransactionsAction({ ids: expansion.ids });
		},
	}),

	defineTool({
		name: "delete_transaction_series",
		title: "Excluir série de lançamentos",
		description:
			"Exclui lançamentos parcelados ou recorrentes conforme o alcance.",
		kind: "destructive",
		input: z.object({ id: uuid(), scope: scope() }),
		handler: async ({ id, scope: selectedScope }, { audit, userId }) => {
			const row = await db.query.transactions.findFirst({
				columns: { seriesId: true },
				where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
			});

			audit({
				affectedIds: [id],
				snapshot: await snapshotTransactions(
					userId,
					row?.seriesId
						? eq(transactions.seriesId, row.seriesId)
						: eq(transactions.id, id),
				),
			});

			return deleteTransactionBulkAction({ id, scope: selectedScope });
		},
	}),

	defineTool({
		name: "toggle_transaction_settlement",
		title: "Marcar como pago",
		description:
			"Marca ou desmarca o pagamento de um lançamento. Compras no cartão são quitadas pela fatura.",
		kind: "write",
		input: z.object({
			id: uuid(),
			value: z.boolean(),
			paymentAccountId: uuid().optional(),
			paymentDate: isoDate().optional(),
		}),
		handler: async (args, { audit }) => {
			audit({ affectedIds: [args.id] });
			return toggleTransactionSettlementAction(args);
		},
	}),

	defineTool({
		name: "refund_transaction",
		title: "Estornar lançamento",
		description: "Registra o estorno de um lançamento.",
		kind: "write",
		input: z.object({
			originalTransactionId: uuid(),
			refundDate: isoDate(),
			refundPeriod: period(),
		}),
		handler: async (args, { audit }) => {
			audit({ affectedIds: [args.originalTransactionId] });
			return refundTransactionAction(args);
		},
	}),

	defineTool({
		name: "convert_transaction_to_installment",
		title: "Converter em parcelado",
		description: "Converte uma compra à vista no cartão em parcelas.",
		kind: "write",
		input: z.object({
			id: uuid(),
			installmentCount: z.number().int().min(2).max(60),
		}),
		handler: async (args, { audit, userId }) => {
			audit({
				affectedIds: [args.id],
				snapshot: await snapshotById(userId, args.id),
			});
			return convertTransactionToInstallmentAction(args);
		},
	}),

	defineTool({
		name: "convert_transaction_to_recurring",
		title: "Converter em recorrente",
		description: "Converte um lançamento à vista em recorrência mensal.",
		kind: "write",
		input: z.object({
			id: uuid(),
			recurrenceCount: z.number().int().min(2).max(60),
		}),
		handler: async (args, { audit, userId }) => {
			audit({
				affectedIds: [args.id],
				snapshot: await snapshotById(userId, args.id),
			});
			return convertTransactionToRecurringAction(args);
		},
	}),

	defineTool({
		name: "list_eligible_installments",
		title: "Parcelas para antecipar",
		description: "Lista as parcelas de uma série que podem ser antecipadas.",
		kind: "read",
		input: z.object({ seriesId: uuid(), anticipationPeriod: period() }),
		handler: ({ seriesId, anticipationPeriod }) =>
			getEligibleInstallmentsAction(seriesId, anticipationPeriod),
	}),

	defineTool({
		name: "create_installment_anticipation",
		title: "Antecipar parcelas",
		description: "Antecipa parcelas de uma série para o período informado.",
		kind: "write",
		input: z.object({
			seriesId: uuid(),
			installmentIds: z.array(uuid()).min(1),
			anticipationPeriod: period(),
			discount: z.number().min(0).optional(),
			payerId: uuid().optional(),
			categoryId: uuid().optional(),
			note: z.string().optional(),
		}),
		handler: async (args, { audit }) => {
			audit({ affectedIds: args.installmentIds });
			return createInstallmentAnticipationAction(args);
		},
	}),

	defineTool({
		name: "cancel_installment_anticipation",
		title: "Cancelar antecipação",
		description: "Desfaz uma antecipação de parcelas.",
		kind: "destructive",
		input: z.object({ anticipationId: uuid() }),
		handler: async (args, { audit }) => {
			audit({ affectedIds: [args.anticipationId] });
			return cancelInstallmentAnticipationAction(args);
		},
	}),
];
