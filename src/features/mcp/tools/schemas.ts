import { z } from "zod";
import {
	PAYMENT_METHODS,
	TRANSACTION_CONDITIONS,
} from "@/features/transactions/lib/constants";
import { RATE_SOURCES } from "@/shared/lib/exchange/constants";

export const uuid = () => z.string().uuid();

export const period = () =>
	z.string().regex(/^\d{4}-\d{2}$/, "Use o formato YYYY-MM.");

export const isoDate = () =>
	z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD.");

export const pagination = {
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(50),
};

export const dryRun = () =>
	z
		.boolean()
		.default(false)
		.describe("Quando true, só simula: nada é gravado.");

/** Nome exato do item: exclusão em cascata leva os lançamentos ligados a ele. */
export const confirmName = () =>
	z
		.string()
		.optional()
		.describe(
			"Repita o nome exato do item. Sem isso a exclusão é recusada. Apaga também os lançamentos ligados.",
		);

/** `Transferência` fica de fora: tem ferramenta própria, que mantém as duas pernas. */
export const transactionType = () => z.enum(["Despesa", "Receita"]);

export const paymentMethod = () => z.enum(PAYMENT_METHODS);

export const transactionCondition = () => z.enum(TRANSACTION_CONDITIONS);

export const transactionFields = {
	name: z.string().min(1).describe("Estabelecimento."),
	amount: z
		.number()
		.min(0)
		.describe("Valor em BRL. Em parcelado, o total da série."),
	purchaseDate: isoDate(),
	period: period()
		.optional()
		.describe(
			"Mês da fatura ou de competência. Em cartão, vazio deriva do fechamento.",
		),
	transactionType: transactionType(),
	condition: transactionCondition(),
	paymentMethod: paymentMethod(),
	categoryId: uuid(),
	payerId: uuid().optional().describe("Vazio usa a pessoa principal."),
	accountId: uuid().optional(),
	cardId: uuid().optional(),
	note: z.string().max(500).optional(),
	installmentCount: z.number().int().min(2).max(60).optional(),
	startInstallment: z.number().int().min(1).max(60).optional(),
	recurrenceCount: z.number().int().min(2).max(60).optional(),
	dueDate: isoDate().optional(),
	boletoPaymentDate: isoDate().optional(),
	isSettled: z.boolean().optional(),
	splitShares: z
		.array(z.object({ payerId: uuid(), amount: z.number().positive() }))
		.optional()
		.describe("Divisão entre pessoas; a soma deve ser igual ao valor."),
	originCurrency: z.string().length(3).optional(),
	originAmount: z.number().min(0).optional(),
	exchangeRate: z.number().positive().optional(),
	rateSource: z.enum(RATE_SOURCES).optional(),
	rateDate: isoDate().optional(),
};

export const transactionInput = z.object(transactionFields);

export type TransactionFields = z.output<typeof transactionInput>;
