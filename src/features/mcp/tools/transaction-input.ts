import { and, eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import type { CreateInput } from "@/features/transactions/actions/core";
import { CREDIT_CARD_PAYMENT_METHOD } from "@/features/transactions/lib/constants";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import type { TransactionFields } from "./schemas";

/** Em cartão, período vazio vem do fechamento, como no diálogo do navegador. */
export async function resolveTransactionPeriod(
	userId: string,
	fields: {
		period?: string;
		cardId?: string | null;
		paymentMethod: string;
		purchaseDate: string;
	},
): Promise<string | undefined> {
	if (
		fields.period ||
		!fields.cardId ||
		fields.paymentMethod !== CREDIT_CARD_PAYMENT_METHOD
	) {
		return fields.period;
	}

	const card = await db.query.cards.findFirst({
		columns: { closingDay: true, dueDay: true },
		where: and(eq(cards.id, fields.cardId), eq(cards.userId, userId)),
	});

	return deriveCreditCardPeriod(
		fields.purchaseDate,
		card?.closingDay,
		card?.dueDay,
	);
}

/** Preenche o que o diálogo do navegador deduz antes de chamar a action. */
export async function buildTransactionInput(
	userId: string,
	fields: TransactionFields,
): Promise<CreateInput> {
	const { splitShares, ...rest } = fields;

	return {
		...rest,
		period: await resolveTransactionPeriod(userId, fields),
		payerId:
			fields.payerId ??
			splitShares?.[0]?.payerId ??
			(await getAdminPayerId(userId)),
		note: fields.note ?? null,
		isSplit: Boolean(splitShares?.length),
		splitShares,
	};
}
