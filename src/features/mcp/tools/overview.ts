import { z } from "zod";
import { fetchCalendarData } from "@/features/calendar/queries";
import { fetchDashboardInvoices } from "@/features/dashboard/invoices/invoices-queries";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { fetchDashboardPeriodOverview } from "@/features/dashboard/overview/period-overview-queries";
import { fetchInboxStatusCounts } from "@/features/inbox/queries";
import { defineTool } from "../lib/define-tool";
import { period } from "./schemas";

export const overviewTools = [
	defineTool({
		name: "get_dashboard_summary",
		title: "Resumo do dashboard",
		description:
			"Métricas do período, contas, faturas e contagem da inbox. Lê direto do banco, sem cache.",
		kind: "read",
		input: z.object({ period: period() }),
		handler: async ({ period: selected }, { userId }) => {
			const [overview, accounts, invoices, inbox] = await Promise.all([
				fetchDashboardPeriodOverview(userId, selected),
				fetchDashboardAccounts(userId),
				fetchDashboardInvoices(userId, selected),
				fetchInboxStatusCounts(userId),
			]);

			return {
				period: selected,
				metrics: overview.metrics,
				accounts,
				invoices,
				inbox,
			};
		},
	}),

	defineTool({
		name: "get_calendar",
		title: "Ver calendário",
		description: "Lista os eventos financeiros do mês.",
		kind: "read",
		input: z.object({ period: period() }),
		handler: async ({ period: selected }, { userId }) => {
			const { events } = await fetchCalendarData({ userId, period: selected });
			return { period: selected, events };
		},
	}),
];
