"use client";

import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { formatDateOnly } from "@/shared/utils/date";
import type { FormState } from "./transaction-dialog-types";

const SOURCE_LABELS: Record<string, string> = {
	PLUGGY: "Banco",
	PTAX: "PTAX",
	FRANKFURTER: "BCE",
	MANUAL: "Manual",
};

interface ExchangeSectionProps {
	formState: FormState;
	onFieldChange: <Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) => void;
	isLoadingRate: boolean;
}

/**
 * Bloco de cotacao exibido quando a moeda nao e BRL.
 *
 * Componente controlado: editar a cotacao escreve `exchangeRate` e editar o
 * total escreve `amount`. O recalculo cruzado (cotacao -> total, total ->
 * cotacao) e a marcacao da fonte como MANUAL ficam no dialogo, que e dono do
 * estado.
 */
export function ExchangeSection({
	formState,
	onFieldChange,
	isLoadingRate,
}: ExchangeSectionProps) {
	if (formState.originCurrency === "BRL") {
		return null;
	}

	const formattedRateDate = formState.rateDate
		? formatDateOnly(formState.rateDate, {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			})
		: null;

	return (
		<div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor="exchangeRate" className="text-xs">
					Cotação
				</Label>
				<Input
					id="exchangeRate"
					inputMode="decimal"
					className="h-8 w-36 text-right"
					value={formState.exchangeRate}
					onChange={(event) =>
						onFieldChange("exchangeRate", event.target.value)
					}
					placeholder={isLoadingRate ? "Buscando..." : "0,0000"}
					disabled={isLoadingRate}
				/>
			</div>

			<div className="flex items-center justify-between gap-2">
				<Label htmlFor="amountBrl" className="text-xs">
					Total em reais
				</Label>
				<CurrencyInput
					id="amountBrl"
					className="h-8 w-36 text-right"
					value={isLoadingRate ? "" : formState.amount}
					onValueChange={(value) => onFieldChange("amount", value)}
					placeholder={isLoadingRate ? "Buscando..." : "R$ 0,00"}
					disabled={isLoadingRate}
				/>
			</div>

			{formState.rateSource ? (
				<p className="text-xs text-muted-foreground">
					{SOURCE_LABELS[formState.rateSource] ?? formState.rateSource}
					{formattedRateDate ? ` · ${formattedRateDate}` : ""}
					{formState.rateSource === "PLUGGY"
						? ""
						: " · ≈ valor aproximado, não inclui IOF nem spread"}
				</p>
			) : isLoadingRate ? null : (
				<p className="text-xs text-muted-foreground">
					Cotação indisponível. Informe a cotação ou o total em reais.
				</p>
			)}
		</div>
	);
}
