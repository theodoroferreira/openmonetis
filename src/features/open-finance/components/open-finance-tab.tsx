"use client";

import {
	RiBankCard2Line,
	RiBankLine,
	RiDeleteBinLine,
	RiExternalLinkLine,
	RiLinkM,
	RiRefreshLine,
	RiWallet2Line,
} from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	connectPluggyItemAction,
	disconnectPluggyItemAction,
	ignorePluggyAccountAction,
	refreshPluggyItemAction,
	syncPluggyNowAction,
} from "@/features/open-finance/actions";
import {
	LinkAccountDialog,
	type LinkTargetOption,
} from "@/features/open-finance/components/link-account-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateTime } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

interface PluggyDiscoveredAccount {
	id: string;
	pluggyAccountId: string;
	type: string;
	subtype: string | null;
	name: string;
	number: string | null;
	balance: string | null;
	limit: string | null;
	availableLimit: string | null;
	statusVinculo: "pendente" | "vinculada" | "ignorada";
	accountId: string | null;
	cardId: string | null;
	lastSyncedAt: Date | null;
	lastSyncError: string | null;
}

interface PluggyItemRow {
	id: string;
	pluggyItemId: string;
	connectorId: number | null;
	connectorName: string | null;
	status: string;
	lastSyncedAt: Date | null;
	createdAt: Date;
	accounts: PluggyDiscoveredAccount[];
}

interface OpenFinanceTabProps {
	items: PluggyItemRow[];
	accountOptions: LinkTargetOption[];
	cardOptions: LinkTargetOption[];
	logoOptions: string[];
}

/** Traduz o status do item do Pluggy para a UI. */
function statusLabel(status: string): { label: string; ok: boolean } {
	switch (status) {
		case "UPDATED":
			return { label: "Conectado", ok: true };
		case "UPDATING":
			return { label: "Atualizando", ok: true };
		case "LOGIN_ERROR":
		case "INVALID_CREDENTIALS":
			return { label: "Credenciais inválidas", ok: false };
		case "OUTDATED":
			return { label: "Desatualizado", ok: false };
		default:
			return { label: status, ok: false };
	}
}

/** Traduz tipo/subtipo da conta do Pluggy para um rotulo legivel na UI. */
function accountTypeLabel(type: string, subtype: string | null): string {
	switch (subtype) {
		case "CHECKING_ACCOUNT":
			return "Conta Corrente";
		case "SAVINGS_ACCOUNT":
			return "Conta Poupança";
		case "CREDIT_CARD":
			return "Cartão de crédito";
		default:
			return type === "CREDIT" ? "Cartão de crédito" : "Conta";
	}
}

/** Mascara o numero da conta, mantendo so os ultimos 4 caracteres visiveis. */
function maskAccountNumber(number: string | null): string | null {
	if (!number) return null;

	const visible = number.slice(-4);
	return number.length > 4 ? `••••${visible}` : number;
}

/** Resolve o nome da conta/cartão já vinculado a uma conta descoberta. */
function resolveLinkedTargetName(
	account: PluggyDiscoveredAccount,
	accountOptions: LinkTargetOption[],
	cardOptions: LinkTargetOption[],
): string | null {
	const options = account.type === "CREDIT" ? cardOptions : accountOptions;
	const targetId =
		account.type === "CREDIT" ? account.cardId : account.accountId;
	if (!targetId) return null;
	return options.find((option) => option.id === targetId)?.name ?? null;
}

function AccountListItem({
	account,
	linkedTargetName,
	onLink,
	onToggle,
	isToggling,
}: {
	account: PluggyDiscoveredAccount;
	linkedTargetName: string | null;
	onLink: (id: string) => void;
	onToggle: (id: string) => void;
	isToggling: boolean;
}) {
	const balance =
		account.balance !== null ? formatCurrency(Number(account.balance)) : null;
	const maskedNumber = maskAccountNumber(account.number);

	return (
		<li className="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
			<div className="flex min-w-0 items-center gap-2">
				{account.type === "CREDIT" ? (
					<RiBankCard2Line className="size-4 shrink-0 text-muted-foreground" />
				) : (
					<RiWallet2Line className="size-4 shrink-0 text-muted-foreground" />
				)}
				<div className="min-w-0">
					<p className="truncate font-medium">{account.name}</p>
					<p className="truncate text-xs text-muted-foreground">
						{accountTypeLabel(account.type, account.subtype)}
						{maskedNumber ? ` · ${maskedNumber}` : ""}
					</p>
					{account.statusVinculo === "vinculada" ? (
						<>
							<p className="truncate text-xs text-muted-foreground">
								Vinculada a{" "}
								<span className="font-medium text-foreground">
									{linkedTargetName ?? "—"}
								</span>
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{account.lastSyncedAt
									? `Última sincronização em ${formatDateTime(account.lastSyncedAt)}`
									: "Ainda não sincronizada"}
							</p>
						</>
					) : null}
					{account.lastSyncError ? (
						<p className="truncate text-xs text-destructive">
							{account.lastSyncError}
						</p>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				<span className="font-medium tabular-nums">{balance ?? "—"}</span>
				{account.statusVinculo === "pendente" ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onLink(account.id)}
					>
						Vincular
					</Button>
				) : null}
				{account.statusVinculo === "vinculada" ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onToggle(account.id)}
						disabled={isToggling}
					>
						{isToggling ? "..." : "Desvincular"}
					</Button>
				) : null}
				{account.statusVinculo === "ignorada" ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onToggle(account.id)}
						disabled={isToggling}
					>
						{isToggling ? "..." : "Voltar para pendente"}
					</Button>
				) : null}
			</div>
		</li>
	);
}

function DiscoveredAccountsList({
	accounts,
	accountOptions,
	cardOptions,
	onLink,
	onToggle,
	togglingAccountId,
}: {
	accounts: PluggyDiscoveredAccount[];
	accountOptions: LinkTargetOption[];
	cardOptions: LinkTargetOption[];
	onLink: (id: string) => void;
	onToggle: (id: string) => void;
	togglingAccountId: string | null;
}) {
	if (accounts.length === 0) {
		return (
			<p className="pl-1 text-xs text-muted-foreground">
				Nenhuma conta encontrada ainda. Use “Atualizar status” ou sincronize
				para descobrir as contas deste item.
			</p>
		);
	}

	const active = accounts.filter(
		(account) => account.statusVinculo !== "ignorada",
	);
	const ignored = accounts.filter(
		(account) => account.statusVinculo === "ignorada",
	);

	const renderItem = (account: PluggyDiscoveredAccount) => (
		<AccountListItem
			key={account.id}
			account={account}
			linkedTargetName={resolveLinkedTargetName(
				account,
				accountOptions,
				cardOptions,
			)}
			onLink={onLink}
			onToggle={onToggle}
			isToggling={togglingAccountId === account.id}
		/>
	);

	return (
		<div className="space-y-2">
			{active.length > 0 ? (
				<ul className="space-y-1.5">{active.map(renderItem)}</ul>
			) : null}
			{ignored.length > 0 ? (
				<div className="space-y-1.5 border-t pt-2">
					<p className="text-xs font-medium text-muted-foreground">Ignoradas</p>
					<ul className="space-y-1.5 opacity-60">{ignored.map(renderItem)}</ul>
				</div>
			) : null}
		</div>
	);
}

export function OpenFinanceTab({
	items,
	accountOptions,
	cardOptions,
	logoOptions,
}: OpenFinanceTabProps) {
	const [itemId, setItemId] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [removeId, setRemoveId] = useState<string | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);
	const [refreshingId, setRefreshingId] = useState<string | null>(null);
	const [linkAccountId, setLinkAccountId] = useState<string | null>(null);
	const [togglingAccountId, setTogglingAccountId] = useState<string | null>(
		null,
	);
	const [isSyncing, setIsSyncing] = useState(false);

	const linkAccount = linkAccountId
		? items
				.flatMap((item) => item.accounts)
				.find((account) => account.id === linkAccountId)
		: null;

	const handleToggleAccount = async (id: string) => {
		setTogglingAccountId(id);
		setError(null);

		try {
			const result = await ignorePluggyAccountAction(id);

			if (!result.success) {
				setError(result.error ?? "Erro ao atualizar a conta");
			}
		} catch {
			setError("Erro ao atualizar a conta");
		} finally {
			setTogglingAccountId(null);
		}
	};

	const handleConnect = async () => {
		const trimmed = itemId.trim();
		if (!trimmed) return;

		setIsConnecting(true);
		setError(null);

		try {
			const result = await connectPluggyItemAction({ itemId: trimmed });

			if (result.success) {
				setItemId("");
			} else {
				setError(result.error ?? "Erro ao vincular a conexão");
			}
		} catch {
			setError("Erro ao vincular a conexão");
		} finally {
			setIsConnecting(false);
		}
	};

	const handleRefresh = async (id: string) => {
		setRefreshingId(id);
		setError(null);

		try {
			const result = await refreshPluggyItemAction(id);

			if (!result.success) {
				setError(result.error ?? "Erro ao atualizar a conexão");
			}
		} catch {
			setError("Erro ao atualizar a conexão");
		} finally {
			setRefreshingId(null);
		}
	};

	const handleSyncNow = async () => {
		setIsSyncing(true);

		try {
			const result = await syncPluggyNowAction();

			if (result.success && result.data) {
				const { accountsSynced, accountsFailed, inboxItemsCreated } =
					result.data;
				toast.success(
					`${accountsSynced} conta(s) sincronizada(s), ${accountsFailed} falha(s), ${inboxItemsCreated} item(ns) criado(s).`,
				);
			} else {
				toast.error(result.error ?? "Erro ao sincronizar.");
			}
		} catch {
			toast.error("Erro ao sincronizar.");
		} finally {
			setIsSyncing(false);
		}
	};

	const handleRemove = async () => {
		if (!removeId) return;

		setIsRemoving(true);
		setError(null);

		try {
			const result = await disconnectPluggyItemAction(removeId);

			if (!result.success) {
				setError(result.error ?? "Erro ao remover a conexão");
			}
		} catch {
			setError("Erro ao remover a conexão");
		} finally {
			setIsRemoving(false);
			setRemoveId(null);
		}
	};

	return (
		<div className="space-y-6">
			<ol className="space-y-2 text-sm text-muted-foreground">
				<li>
					1. Conecte seus bancos no{" "}
					<a
						href="https://meu.pluggy.ai"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
					>
						Meu Pluggy
						<RiExternalLinkLine className="size-3" />
					</a>
					.
				</li>
				<li>
					2. No Pluggy Dashboard, vincule esses items ao seu aplicativo. Eles
					passam a funcionar como proxy das conexões já existentes.
				</li>
				<li>3. Copie o itemId e cole abaixo.</li>
			</ol>

			<div className="space-y-2">
				<Label htmlFor="pluggy-item-id">itemId</Label>
				<div className="flex gap-2">
					<Input
						id="pluggy-item-id"
						value={itemId}
						onChange={(e) => setItemId(e.target.value)}
						placeholder="00000000-0000-0000-0000-000000000000"
						autoComplete="off"
						spellCheck={false}
					/>
					<Button onClick={handleConnect} disabled={isConnecting}>
						<RiLinkM className="size-4" />
						{isConnecting ? "Vinculando..." : "Vincular"}
					</Button>
				</div>
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
			</div>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nenhuma conexão vinculada.
				</p>
			) : (
				<div className="space-y-3">
					<div className="flex justify-end">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleSyncNow}
							disabled={isSyncing}
						>
							<RiRefreshLine
								className={cn("size-4", isSyncing && "animate-spin")}
								aria-hidden
							/>
							{isSyncing ? "Atualizando..." : "Atualizar agora"}
						</Button>
					</div>
					<ul className="space-y-2">
						{items.map((item) => {
							const status = statusLabel(item.status);

							return (
								<li key={item.id} className="space-y-3 rounded-lg border p-3">
									<div className="flex items-center justify-between gap-4">
										<div className="min-w-0 space-y-1">
											<div className="flex items-center gap-2">
												<RiBankLine className="size-4 shrink-0 text-muted-foreground" />
												<span className="font-medium">
													{item.connectorName ?? "Conector desconhecido"}
												</span>
												<Badge variant={status.ok ? "success" : "destructive"}>
													{status.label}
												</Badge>
											</div>
											<p className="truncate text-xs text-muted-foreground">
												{item.pluggyItemId}
											</p>
											<p className="text-xs text-muted-foreground">
												Vinculado em {formatDateTime(item.createdAt)}
											</p>
											<p className="text-xs text-muted-foreground">
												{item.lastSyncedAt
													? `Status verificado em ${formatDateTime(item.lastSyncedAt)}`
													: "Status nunca verificado"}
											</p>
										</div>
										<div className="flex items-center gap-1">
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												onClick={() => handleRefresh(item.id)}
												disabled={refreshingId === item.id}
												aria-label="Atualizar status da conexão"
												title="Atualizar status"
											>
												<RiRefreshLine
													className={cn(
														"size-4 transition-transform duration-200",
														refreshingId === item.id && "animate-spin",
													)}
													aria-hidden
												/>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												onClick={() => setRemoveId(item.id)}
												disabled={refreshingId === item.id}
												aria-label="Remover conexão"
												title="Remover conexão"
											>
												<RiDeleteBinLine className="size-4" />
											</Button>
										</div>
									</div>
									<div className="border-t pt-3">
										<DiscoveredAccountsList
											accounts={item.accounts}
											accountOptions={accountOptions}
											cardOptions={cardOptions}
											onLink={setLinkAccountId}
											onToggle={handleToggleAccount}
											togglingAccountId={togglingAccountId}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			<AlertDialog
				open={removeId !== null}
				onOpenChange={(open) => !open && setRemoveId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remover conexão?</AlertDialogTitle>
						<AlertDialogDescription>
							O vínculo é removido do OpenMonetis. A conexão com o banco
							continua existindo no Meu Pluggy.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={handleRemove} disabled={isRemoving}>
							{isRemoving ? "Removendo..." : "Remover"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{linkAccount ? (
				<LinkAccountDialog
					pluggyAccount={{
						id: linkAccount.id,
						type: linkAccount.type,
						name: linkAccount.name,
					}}
					accountOptions={accountOptions}
					cardOptions={cardOptions}
					logoOptions={logoOptions}
					open={linkAccountId !== null}
					onOpenChange={(open) => !open && setLinkAccountId(null)}
				/>
			) : null}
		</div>
	);
}
