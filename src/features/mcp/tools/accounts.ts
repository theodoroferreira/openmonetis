import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { financialAccounts, transactions } from "@/db/schema";
import {
	addAccountYieldAction,
	adjustAccountBalanceAction,
	createAccountAction,
	deleteAccountAction,
	transferBetweenAccountsAction,
	updateAccountAction,
} from "@/features/accounts/actions";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import { fetchAccountSummary } from "@/features/accounts/statement-queries";
import { db } from "@/shared/lib/db";
import { snapshotTransactions } from "../lib/cascade-snapshot";
import { defineTool } from "../lib/define-tool";
import { checkConfirmation } from "../lib/tool-result";
import { confirmName, isoDate, period, uuid } from "./schemas";

const accountFields = {
	name: z.string().min(1),
	accountType: z.string().min(1).describe("Ex.: Conta Corrente, Poupança."),
	status: z.enum(["Ativa", "Inativa"]),
	note: z.string().max(500).optional(),
	logo: z
		.string()
		.min(1)
		.describe("Um dos valores de logoOptions em list_accounts."),
	initialBalance: z.number(),
	excludeFromBalance: z.boolean().optional(),
	excludeInitialBalanceFromIncome: z.boolean().optional(),
};

const withoutLogo = <T extends { logo?: unknown }>({
	logo: _logo,
	...account
}: T) => account;

export const accountTools = [
	defineTool({
		name: "list_accounts",
		title: "Listar contas",
		description: "Lista contas ativas e inativas com saldo.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => {
			const data = await fetchAllAccountsForUser(userId);

			return {
				activeAccounts: data.activeAccounts.map(withoutLogo),
				archivedAccounts: data.archivedAccounts.map(withoutLogo),
				logoOptions: data.logoOptions,
			};
		},
	}),

	defineTool({
		name: "create_account",
		title: "Criar conta",
		description: "Cria uma conta bancária.",
		kind: "write",
		input: z.object(accountFields),
		handler: (args) =>
			createAccountAction({
				...args,
				note: args.note ?? null,
				excludeFromBalance: args.excludeFromBalance ?? false,
				excludeInitialBalanceFromIncome:
					args.excludeInitialBalanceFromIncome ?? false,
			}),
	}),

	defineTool({
		name: "update_account",
		title: "Editar conta",
		description:
			"Atualiza uma conta: informe só o que muda, o resto é preservado.",
		kind: "write",
		input: z.object(accountFields).partial().extend({ id: uuid() }),
		handler: async ({ id, ...changes }, { userId, audit }) => {
			const account = await db.query.financialAccounts.findFirst({
				where: and(
					eq(financialAccounts.id, id),
					eq(financialAccounts.userId, userId),
				),
			});

			if (!account) {
				return { success: false, error: "Conta não encontrada." };
			}

			audit({ affectedIds: [id], snapshot: { account } });

			return updateAccountAction({
				id,
				name: changes.name ?? account.name,
				accountType: changes.accountType ?? account.accountType,
				status: changes.status ?? account.status,
				note: changes.note ?? account.note,
				logo: changes.logo ?? account.logo,
				initialBalance:
					changes.initialBalance ?? Number(account.initialBalance),
				excludeFromBalance:
					changes.excludeFromBalance ?? account.excludeFromBalance,
				excludeInitialBalanceFromIncome:
					changes.excludeInitialBalanceFromIncome ??
					account.excludeInitialBalanceFromIncome,
			});
		},
	}),

	defineTool({
		name: "delete_account",
		title: "Excluir conta",
		description:
			"Exclui a conta e todos os lançamentos dela. Exige confirm com o nome exato.",
		kind: "destructive",
		input: z.object({ id: uuid(), confirm: confirmName() }),
		handler: async ({ id, confirm }, { userId, audit }) => {
			const account = await db.query.financialAccounts.findFirst({
				where: and(
					eq(financialAccounts.id, id),
					eq(financialAccounts.userId, userId),
				),
			});

			if (!account) {
				return { success: false, error: "Conta não encontrada." };
			}

			const refusal = checkConfirmation(account.name, confirm);
			if (refusal) return { success: false, error: refusal };

			audit({
				affectedIds: [id],
				snapshot: {
					account,
					...(await snapshotTransactions(
						userId,
						eq(transactions.accountId, id),
					)),
				},
			});

			return deleteAccountAction({ id });
		},
	}),

	defineTool({
		name: "transfer_between_accounts",
		title: "Transferir entre contas",
		description: "Registra uma transferência entre duas contas.",
		kind: "write",
		input: z.object({
			fromAccountId: uuid(),
			toAccountId: uuid(),
			amount: z.number().positive(),
			date: isoDate(),
			period: period(),
		}),
		handler: ({ amount, ...args }) =>
			transferBetweenAccountsAction({ ...args, amount: amount.toFixed(2) }),
	}),

	defineTool({
		name: "add_account_yield",
		title: "Registrar rendimento",
		description: "Adiciona um rendimento à conta.",
		kind: "write",
		input: z.object({
			accountId: uuid(),
			amount: z.number().positive(),
			date: isoDate(),
		}),
		handler: (args) => addAccountYieldAction(args),
	}),

	defineTool({
		name: "adjust_account_balance",
		title: "Ajustar saldo",
		description:
			"Cria o lançamento de ajuste para o saldo do período chegar ao valor informado. O saldo atual é calculado no servidor.",
		kind: "write",
		input: z.object({
			accountId: uuid(),
			period: period(),
			targetBalance: z.number(),
		}),
		handler: async (
			{ accountId, period: selected, targetBalance },
			{ userId },
		) => {
			const { currentBalance } = await fetchAccountSummary(
				userId,
				accountId,
				selected,
			);

			return adjustAccountBalanceAction({
				accountId,
				period: selected,
				currentBalance,
				targetBalance,
			});
		},
	}),
];
