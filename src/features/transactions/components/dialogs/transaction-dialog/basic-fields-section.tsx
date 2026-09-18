"use client";

import { RiCalculatorLine } from "@remixicon/react";
import { CalculatorDialogButton } from "@/shared/components/calculator/calculator-dialog";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/shared/lib/exchange/constants";
import { formatForeignCurrency } from "@/shared/lib/exchange/format";
import { EstablishmentInput } from "../../shared/establishment-input";
import { ExchangeSection } from "./exchange-section";
import type { BasicFieldsSectionProps } from "./transaction-dialog-types";

export function BasicFieldsSection({
	formState,
	onFieldChange,
	estabelecimentos,
	isLoadingRate,
}: Omit<BasicFieldsSectionProps, "monthOptions">) {
	// Em moeda estrangeira o campo "Valor" e o valor de origem; o total em
	// reais (`amount`) passa a ser editado no bloco de cotacao.
	const isForeign = formState.originCurrency !== "BRL";
	const valueField = isForeign ? "originAmount" : "amount";

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<Label htmlFor="name">Descrição</Label>
				<EstablishmentInput
					id="name"
					value={formState.name}
					onChange={(value) => onFieldChange("name", value)}
					estabelecimentos={estabelecimentos}
					placeholder="Ex.: Restaurante do Zé"
					maxLength={60}
					required
				/>
			</div>

			<div className="flex w-full flex-col gap-2 md:flex-row">
				<div className="w-full md:w-1/2 space-y-1">
					<Label htmlFor="purchaseDate">Data</Label>
					<DatePicker
						id="purchaseDate"
						value={formState.purchaseDate}
						onChange={(value) => onFieldChange("purchaseDate", value)}
						placeholder="Data"
						required
					/>
				</div>

				<div className="w-full md:w-1/2 space-y-1">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="amount">Valor</Label>
						<Select
							value={formState.originCurrency}
							onValueChange={(value) => onFieldChange("originCurrency", value)}
						>
							<SelectTrigger
								id="originCurrency"
								aria-label="Moeda"
								className="h-6 w-auto border-0 bg-transparent px-1 text-xs text-muted-foreground"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SUPPORTED_CURRENCIES.map((currency) => (
									<SelectItem key={currency.code} value={currency.code}>
										{currency.code} · {currency.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="relative">
						<CurrencyInput
							id="amount"
							currency={formState.originCurrency}
							value={isForeign ? formState.originAmount : formState.amount}
							onValueChange={(value) => onFieldChange(valueField, value)}
							placeholder={
								isForeign
									? formatForeignCurrency(0, formState.originCurrency)
									: "R$ 0,00"
							}
							required
							className="pr-10"
						/>
						<CalculatorDialogButton
							variant="ghost"
							size="icon-sm"
							className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
							onSelectValue={(value) => onFieldChange(valueField, value)}
						>
							<RiCalculatorLine className="h-4 w-4 text-muted-foreground" />
						</CalculatorDialogButton>
					</div>
				</div>
			</div>

			<ExchangeSection
				formState={formState}
				onFieldChange={onFieldChange}
				isLoadingRate={isLoadingRate}
			/>
		</div>
	);
}
