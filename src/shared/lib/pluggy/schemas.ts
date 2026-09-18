import { z } from "zod";

/** Resposta de POST /auth */
export const pluggyAuthResponseSchema = z.object({
	apiKey: z.string().min(1),
});

/** Conector (instituição). O Meu Pluggy é o conector 200. */
export const pluggyConnectorSchema = z.object({
	id: z.number().int(),
	name: z.string(),
});

/** Resposta de GET /items/{id} — apenas os campos que usamos. */
export const pluggyItemSchema = z.object({
	id: z.string().uuid(),
	status: z.string(),
	connector: pluggyConnectorSchema,
	updatedAt: z.string().optional(),
});

export type PluggyItem = z.infer<typeof pluggyItemSchema>;

/** Campos adicionais de contas do tipo BANK. */
export const pluggyAccountBankDataSchema = z.object({
	transferNumber: z.string().nullable().optional(),
	closingBalance: z.number().nullable().optional(),
	overdraftContractedLimit: z.number().nullable().optional(),
	overdraftUsedLimit: z.number().nullable().optional(),
});

/** Campos adicionais de contas do tipo CREDIT. */
export const pluggyAccountCreditDataSchema = z.object({
	level: z.string().nullable().optional(),
	brand: z.string().nullable().optional(),
	brandAdditionalInfo: z.string().nullable().optional(),
	balanceCloseDate: z.string().nullable().optional(),
	balanceDueDate: z.string().nullable().optional(),
	availableCreditLimit: z.number().nullable().optional(),
	balanceForeignCurrency: z.number().nullable().optional(),
	minimumPayment: z.number().nullable().optional(),
	creditLimit: z.number().nullable().optional(),
	isLimitFlexible: z.boolean().nullable().optional(),
	status: z.string().nullable().optional(),
	holderType: z.string().nullable().optional(),
});

/** Resposta de GET /accounts — um item de `results`. */
export const pluggyAccountSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(["BANK", "CREDIT"]),
	subtype: z.enum(["SAVINGS_ACCOUNT", "CHECKING_ACCOUNT", "CREDIT_CARD"]),
	number: z.string(),
	name: z.string(),
	marketingName: z.string().nullable().optional(),
	balance: z.number(),
	itemId: z.string().uuid(),
	taxNumber: z.string().nullable().optional(),
	owner: z.string().nullable().optional(),
	currencyCode: z.string(),
	bankData: pluggyAccountBankDataSchema.nullable().optional(),
	creditData: pluggyAccountCreditDataSchema.nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type PluggyAccount = z.infer<typeof pluggyAccountSchema>;

/** Resposta de GET /accounts. */
export const pluggyAccountsListResponseSchema = z.object({
	page: z.number(),
	total: z.number(),
	totalPages: z.number(),
	results: z.array(pluggyAccountSchema),
});

/** `creditCardMetadata` de uma transacao — so aparece em contas CREDIT. */
export const pluggyTransactionCreditCardMetadataSchema = z.object({
	installmentNumber: z.number().nullable().optional(),
	totalInstallments: z.number().nullable().optional(),
	totalAmount: z.number().nullable().optional(),
	purchaseDate: z.string().nullable().optional(),
	billId: z.string().nullable().optional(),
	billForecastDate: z.string().nullable().optional(),
});

/** `merchant` extraido de uma transacao. */
export const pluggyTransactionMerchantSchema = z.object({
	name: z.string().nullable().optional(),
	businessName: z.string().nullable().optional(),
	cnpj: z.string().nullable().optional(),
	category: z.string().nullable().optional(),
});

/** `paymentData` de transferencias e pagamentos. */
export const pluggyTransactionPaymentDataSchema = z.object({
	paymentMethod: z.string().nullable().optional(),
	reason: z.string().nullable().optional(),
	referenceNumber: z.string().nullable().optional(),
});

/** Resposta de GET /v2/transactions — um item de `results`. */
export const pluggyTransactionSchema = z.object({
	id: z.string(),
	description: z.string(),
	descriptionRaw: z.string().nullable().optional(),
	currencyCode: z.string(),
	amount: z.number(),
	date: z.string(),
	type: z.enum(["DEBIT", "CREDIT"]),
	balance: z.number().nullable().optional(),
	providerCode: z.string().nullable().optional(),
	status: z.enum(["POSTED", "PENDING"]),
	category: z.string().nullable().optional(),
	categoryId: z.string().nullable().optional(),
	paymentData: pluggyTransactionPaymentDataSchema.nullable().optional(),
	creditCardMetadata: pluggyTransactionCreditCardMetadataSchema
		.nullable()
		.optional(),
	merchant: pluggyTransactionMerchantSchema.nullable().optional(),
	operationType: z.string().nullable().optional(),
	operationTypeAdditionalInfo: z.string().nullable().optional(),
	providerId: z.string().nullable().optional(),
	accountId: z.string().uuid(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>;

/** Resposta paginada (cursor) de GET /v2/transactions. */
export const pluggyTransactionsPageSchema = z.object({
	results: z.array(pluggyTransactionSchema),
	next: z.string().nullable(),
});
