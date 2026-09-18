import type { PluggyAccount } from "@/shared/lib/pluggy/schemas";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";

export type PluggyBankAccountCandidate = {
	kind: "conta";
	accountType: "Conta Corrente" | "Conta Poupança";
	name: string;
	balance: string;
};

export type PluggyCreditAccountCandidate = {
	kind: "cartao";
	name: string;
	balance: string;
	limit: string | null;
	closingDay: string | null;
	dueDay: string | null;
	brand: string | null;
};

export type PluggyAccountCandidate =
	| PluggyBankAccountCandidate
	| PluggyCreditAccountCandidate;

/** Campos de `contas_pluggy` derivados diretamente da conta do Pluggy (sem contexto de usuario/item). */
export type PluggyAccountRow = {
	type: PluggyAccount["type"];
	subtype: PluggyAccount["subtype"];
	name: string;
	number: string;
	currency: string;
	balance: string;
	balanceUpdatedAt: Date;
	limit: string | null;
	availableLimit: string | null;
	closingDay: string | null;
	dueDay: string | null;
	brand: string | null;
};

function extractDayOfMonth(value: string | null | undefined): string | null {
	if (!value) return null;

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;

	return parsed.getUTCDate().toString();
}

function formatOptionalDecimal(
	value: number | null | undefined,
): string | null {
	if (value === null || value === undefined) return null;

	return formatDecimalForDbRequired(value);
}

function toBankAccountType(
	subtype: PluggyAccount["subtype"],
): "Conta Corrente" | "Conta Poupança" {
	return subtype === "SAVINGS_ACCOUNT" ? "Conta Poupança" : "Conta Corrente";
}

/** Traduz uma conta do Pluggy em candidata a conta ou cartao do OpenMonetis. Funcao pura. */
export function mapPluggyAccountToCandidate(
	account: PluggyAccount,
): PluggyAccountCandidate {
	const name = account.marketingName ?? account.name;
	const balance = formatDecimalForDbRequired(account.balance);

	if (account.type === "CREDIT") {
		const creditData = account.creditData;

		return {
			kind: "cartao",
			name,
			balance,
			limit: formatOptionalDecimal(creditData?.creditLimit),
			closingDay: extractDayOfMonth(creditData?.balanceCloseDate),
			dueDay: extractDayOfMonth(creditData?.balanceDueDate),
			brand: creditData?.brand ?? null,
		};
	}

	return {
		kind: "conta",
		accountType: toBankAccountType(account.subtype),
		name,
		balance,
	};
}

/** Traduz uma conta do Pluggy para as colunas de upsert de `contas_pluggy`. Funcao pura. */
export function mapPluggyAccountToRow(
	account: PluggyAccount,
): PluggyAccountRow {
	const creditData = account.creditData;

	return {
		type: account.type,
		subtype: account.subtype,
		name: account.marketingName ?? account.name,
		number: account.number,
		currency: account.currencyCode,
		balance: formatDecimalForDbRequired(account.balance),
		balanceUpdatedAt: new Date(account.updatedAt),
		limit: formatOptionalDecimal(creditData?.creditLimit),
		availableLimit: formatOptionalDecimal(creditData?.availableCreditLimit),
		closingDay: extractDayOfMonth(creditData?.balanceCloseDate),
		dueDay: extractDayOfMonth(creditData?.balanceDueDate),
		brand: creditData?.brand ?? null,
	};
}
