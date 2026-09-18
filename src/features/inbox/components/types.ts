import type { SelectOption as TransactionSelectOption } from "@/features/transactions/components/types";

export type InboxStatus = "pending" | "processed" | "discarded";

export interface InboxItem {
	id: string;
	sourceApp: string;
	sourceAppName: string | null;
	originalTitle: string | null;
	originalText: string;
	notificationTimestamp: Date;
	parsedName: string | null;
	parsedAmount: string | null;
	pluggyAccountId: string | null;
	pluggyFlag: string | null;
	parsedTransactionType: string | null;
	parsedDate: Date | null;
	parsedPeriod: string | null;
	parsedPaymentMethod: string | null;
	parsedCategoryId: string | null;
	parsedAccountId: string | null;
	parsedCardId: string | null;
	parsedInstallmentCount: number | null;
	parsedCurrentInstallment: number | null;
	status: string;
	transactionId: string | null;
	processedAt: Date | null;
	discardedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type InboxStatusCounts = Record<InboxStatus, number>;

export type InboxPaginationState = {
	page: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
};

// Re-export the lancamentos SelectOption for use in inbox components
export type SelectOption = TransactionSelectOption;
