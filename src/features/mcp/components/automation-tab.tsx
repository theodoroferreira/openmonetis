"use client";

import { RiFileCopyLine, RiRobot2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ApiTokensForm } from "@/features/settings/components/api-tokens-form";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateTime } from "@/shared/utils/date";
import { undoInboxApprovalAction } from "../actions";
import type { AutomationAuditEntry } from "../queries";

interface ApiToken {
	id: string;
	name: string;
	tokenPrefix: string;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	revokedAt: Date | null;
}

interface AutomationTabProps {
	mcpUrl: string;
	tokens: ApiToken[];
	auditEntries: AutomationAuditEntry[];
}

const RESULT_BADGE: Record<
	AutomationAuditEntry["result"],
	{ label: string; variant: "secondary" | "destructive" | "outline" }
> = {
	success: { label: "Feito", variant: "secondary" },
	error: { label: "Erro", variant: "destructive" },
	dry_run: { label: "Simulação", variant: "outline" },
};

function UndoApprovalButton({
	item,
}: {
	item: AutomationAuditEntry["undoableItems"][number];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const label = item.name ?? "Item sem nome";

	const handleUndo = () => {
		startTransition(async () => {
			const result = await undoInboxApprovalAction({ id: item.id });

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="min-w-0 truncate">
				{label}
				{item.amount ? ` · ${formatCurrency(Number(item.amount))}` : null}
			</span>
			<ConfirmActionDialog
				trigger={
					<Button variant="ghost" size="sm" disabled={isPending}>
						Desfazer
					</Button>
				}
				title="Desfazer aprovação?"
				description={`O lançamento "${label}" será excluído e o item volta para a inbox.`}
				confirmLabel="Desfazer"
				confirmVariant="destructive"
				pendingLabel="Desfazendo..."
				onConfirm={handleUndo}
			/>
		</div>
	);
}

export function AutomationTab({
	mcpUrl,
	tokens,
	auditEntries,
}: AutomationTabProps) {
	const handleCopyUrl = async () => {
		await navigator.clipboard.writeText(mcpUrl);
		toast.success("Endereço copiado.");
	};

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h3 className="font-semibold">Endereço do servidor</h3>
				<p className="text-sm text-muted-foreground">
					No cliente MCP, use este endereço com o cabeçalho{" "}
					<code className="rounded bg-muted px-1 py-0.5 text-xs">
						Authorization: Bearer
					</code>{" "}
					e um token criado abaixo.
				</p>
				<div className="flex items-center gap-2">
					<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">
						{mcpUrl}
					</code>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						onClick={handleCopyUrl}
						aria-label="Copiar endereço"
					>
						<RiFileCopyLine className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<Separator />

			<ApiTokensForm tokens={tokens} scope="mcp" />

			<Separator />

			<div className="space-y-3">
				<div>
					<h3 className="font-semibold">Atividade recente</h3>
					<p className="text-sm text-muted-foreground">
						Tudo que o assistente alterou. Leituras não aparecem aqui.
					</p>
				</div>

				{auditEntries.length === 0 ? (
					<div className="flex items-center gap-3 py-4 text-muted-foreground">
						<RiRobot2Line className="h-5 w-5" />
						<p className="text-sm">Nenhuma atividade registrada.</p>
					</div>
				) : (
					<ul className="divide-y">
						{auditEntries.map((entry) => {
							const badge = RESULT_BADGE[entry.result];

							return (
								<li key={entry.id} className="space-y-1 py-3">
									<div className="flex flex-wrap items-center gap-2">
										<code className="text-sm font-medium">{entry.tool}</code>
										<Badge variant={badge.variant}>{badge.label}</Badge>
										<span className="ml-auto text-xs text-muted-foreground">
											{formatDateTime(entry.createdAt)}
										</span>
									</div>
									{entry.message ? (
										<p className="break-words text-sm text-muted-foreground">
											{entry.message}
										</p>
									) : null}
									{entry.undoableItems.map((item) => (
										<UndoApprovalButton key={item.id} item={item} />
									))}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
