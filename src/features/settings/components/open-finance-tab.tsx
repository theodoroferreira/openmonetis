"use client";

import {
	RiBankLine,
	RiDeleteBinLine,
	RiExternalLinkLine,
	RiLinkM,
} from "@remixicon/react";
import { useState } from "react";
import {
	connectPluggyItemAction,
	disconnectPluggyItemAction,
} from "@/features/settings/actions";
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
import { formatDateTime } from "@/shared/utils/date";

interface PluggyItemRow {
	id: string;
	pluggyItemId: string;
	connectorId: number | null;
	connectorName: string | null;
	status: string;
	lastSyncedAt: Date | null;
	createdAt: Date;
}

interface OpenFinanceTabProps {
	items: PluggyItemRow[];
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

export function OpenFinanceTab({ items }: OpenFinanceTabProps) {
	const [itemId, setItemId] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [removeId, setRemoveId] = useState<string | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);

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

	const handleRemove = async () => {
		if (!removeId) return;

		setIsRemoving(true);

		try {
			await disconnectPluggyItemAction(removeId);
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
				<ul className="space-y-2">
					{items.map((item) => {
						const status = statusLabel(item.status);

						return (
							<li
								key={item.id}
								className="flex items-center justify-between gap-4 rounded-lg border p-3"
							>
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
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setRemoveId(item.id)}
									aria-label="Remover conexão"
								>
									<RiDeleteBinLine className="size-4" />
								</Button>
							</li>
						);
					})}
				</ul>
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
		</div>
	);
}
