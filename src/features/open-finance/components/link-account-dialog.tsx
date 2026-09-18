"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	DEFAULT_ACCOUNT_STATUS,
	DEFAULT_ACCOUNT_TYPES,
} from "@/features/accounts/components/account-dialog";
import { AccountFormFields } from "@/features/accounts/components/account-form-fields";
import type { AccountFormValues } from "@/features/accounts/components/types";
import { CardFormFields } from "@/features/cards/components/card-form-fields";
import { AccountSelectContent } from "@/features/cards/components/card-select-items";
import type { CardFormValues } from "@/features/cards/components/types";
import {
	ignorePluggyAccountAction,
	type LinkPluggyAccountInput,
	linkPluggyAccountAction,
} from "@/features/open-finance/actions";
import {
	LogoPickerDialog,
	LogoPickerTrigger,
} from "@/shared/components/logo-picker";
import { useLogoSelection } from "@/shared/components/logo-picker/use-logo-selection";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFormState } from "@/shared/hooks/use-form-state";
import {
	DEFAULT_CARD_BRANDS,
	DEFAULT_CARD_STATUS,
} from "@/shared/lib/cards/constants";
import { normalizeDecimalInput } from "@/shared/utils/currency";

export interface LinkTargetOption {
	id: string;
	name: string;
	logo: string | null;
}

interface LinkAccountDialogProps {
	pluggyAccount: { id: string; type: string; name: string };
	accountOptions: LinkTargetOption[];
	cardOptions: LinkTargetOption[];
	logoOptions: string[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type LinkMode = "existing" | "create" | "ignore";

function buildAccountInitialValues(
	name: string,
	logoOptions: string[],
): AccountFormValues {
	return {
		name,
		accountType: DEFAULT_ACCOUNT_TYPES[0],
		status: DEFAULT_ACCOUNT_STATUS[0],
		note: "",
		logo: logoOptions[0] ?? "",
		initialBalance: "0",
		excludeFromBalance: false,
		excludeInitialBalanceFromIncome: false,
	};
}

function buildCardInitialValues(
	name: string,
	logoOptions: string[],
	accountOptions: LinkTargetOption[],
): CardFormValues {
	return {
		name,
		brand: DEFAULT_CARD_BRANDS[0],
		status: DEFAULT_CARD_STATUS[0],
		closingDay: "01",
		dueDay: "10",
		limit: "",
		note: "",
		logo: logoOptions[0] ?? "",
		accountId: accountOptions[0]?.id ?? "",
	};
}

/**
 * Dialogo de vinculo de uma conta descoberta do Pluggy: vincular a um
 * destino existente, criar uma conta/cartao novo, ou ignorar a conta.
 * Reaproveita os mesmos campos de formulario de Contas/Cartoes — o payload
 * de "criar novo" espelha exatamente `linkPluggyAccountSchema` (actions.ts).
 */
export function LinkAccountDialog({
	pluggyAccount,
	accountOptions,
	cardOptions,
	logoOptions,
	open,
	onOpenChange,
}: LinkAccountDialogProps) {
	const isCredit = pluggyAccount.type === "CREDIT";
	const targetOptions = isCredit ? cardOptions : accountOptions;

	const [mode, setMode] = useState<LinkMode>(
		targetOptions.length > 0 ? "existing" : "create",
	);
	const [existingId, setExistingId] = useState("");
	const [logoDialogOpen, setLogoDialogOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const accountInitialValues = useMemo(
		() => buildAccountInitialValues(pluggyAccount.name, logoOptions),
		[pluggyAccount.name, logoOptions],
	);
	const cardInitialValues = useMemo(
		() =>
			buildCardInitialValues(pluggyAccount.name, logoOptions, accountOptions),
		[pluggyAccount.name, logoOptions, accountOptions],
	);

	const {
		formState: accountFormState,
		resetForm: resetAccountForm,
		updateField: updateAccountField,
		updateFields: updateAccountFields,
	} = useFormState<AccountFormValues>(accountInitialValues);

	const {
		formState: cardFormState,
		resetForm: resetCardForm,
		updateField: updateCardField,
		updateFields: updateCardFields,
	} = useFormState<CardFormValues>(cardInitialValues);

	useEffect(() => {
		if (open) {
			setMode(targetOptions.length > 0 ? "existing" : "create");
			setExistingId("");
			setErrorMessage(null);
			resetAccountForm(accountInitialValues);
			resetCardForm(cardInitialValues);
		}
	}, [
		open,
		targetOptions.length,
		accountInitialValues,
		cardInitialValues,
		resetAccountForm,
		resetCardForm,
	]);

	useEffect(() => {
		if (!open) {
			setLogoDialogOpen(false);
		}
	}, [open]);

	const handleAccountLogoSelection = useLogoSelection({
		mode: "create",
		currentLogo: accountFormState.logo,
		currentName: accountFormState.name,
		onUpdate: (updates) => {
			updateAccountFields(updates);
			requestAnimationFrame(() => setLogoDialogOpen(false));
		},
	});

	const handleCardLogoSelection = useLogoSelection({
		mode: "create",
		currentLogo: cardFormState.logo,
		currentName: cardFormState.name,
		onUpdate: (updates) => {
			updateCardFields(updates);
			requestAnimationFrame(() => setLogoDialogOpen(false));
		},
	});

	const handleConfirm = () => {
		setErrorMessage(null);

		if (mode === "ignore") {
			startTransition(async () => {
				const result = await ignorePluggyAccountAction(pluggyAccount.id);

				if (result.success) {
					toast.success(result.message);
					onOpenChange(false);
					return;
				}

				const message = result.error ?? "Não foi possível ignorar a conta.";
				setErrorMessage(message);
				toast.error(message);
			});
			return;
		}

		let target: LinkPluggyAccountInput["target"];

		if (mode === "existing") {
			if (!existingId) {
				setErrorMessage(
					isCredit ? "Selecione um cartão." : "Selecione uma conta.",
				);
				return;
			}

			target = isCredit
				? { mode: "existing_card", cardId: existingId }
				: { mode: "existing_account", accountId: existingId };
		} else if (isCredit) {
			if (!cardFormState.accountId) {
				setErrorMessage("Selecione a conta-pai do cartão.");
				return;
			}

			if (!cardFormState.logo) {
				setErrorMessage("Selecione um logo.");
				return;
			}

			const rawLimit = normalizeDecimalInput(cardFormState.limit);
			const limitValue = rawLimit ? Number(rawLimit) : 0;
			if (!Number.isFinite(limitValue) || limitValue <= 0) {
				setErrorMessage("Informe um limite maior que zero.");
				return;
			}

			target = {
				mode: "create_card",
				name: cardFormState.name.trim(),
				brand: cardFormState.brand,
				status: cardFormState.status,
				closingDay: cardFormState.closingDay,
				dueDay: cardFormState.dueDay,
				limit: limitValue,
				note: cardFormState.note.trim() || null,
				logo: cardFormState.logo,
				accountId: cardFormState.accountId,
			};
		} else {
			if (!accountFormState.logo) {
				setErrorMessage("Selecione um logo.");
				return;
			}

			target = {
				mode: "create_account",
				name: accountFormState.name.trim(),
				accountType: accountFormState.accountType,
				status: accountFormState.status,
				logo: accountFormState.logo,
				note: accountFormState.note.trim() || null,
			};
		}

		startTransition(async () => {
			const result = await linkPluggyAccountAction({
				pluggyAccountId: pluggyAccount.id,
				target,
			});

			if (result.success) {
				toast.success(result.message);
				onOpenChange(false);
				return;
			}

			const message = result.error ?? "Não foi possível vincular a conta.";
			setErrorMessage(message);
			toast.error(message);
		});
	};

	const handleMainDialogOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && logoDialogOpen) {
			return;
		}
		onOpenChange(nextOpen);
	};

	return (
		<>
			<Dialog open={open} onOpenChange={handleMainDialogOpenChange}>
				<DialogContent
					className="sm:max-w-xl"
					onPointerDownOutside={(e) => {
						if (logoDialogOpen) e.preventDefault();
					}}
					onInteractOutside={(e) => {
						if (logoDialogOpen) e.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>Vincular {pluggyAccount.name}</DialogTitle>
						<DialogDescription>
							Escolha para onde os lançamentos desta conta devem ir.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-5">
						<RadioGroup
							value={mode}
							onValueChange={(value) => setMode(value as LinkMode)}
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem
									id="link-mode-existing"
									value="existing"
									disabled={targetOptions.length === 0}
								/>
								<Label
									htmlFor="link-mode-existing"
									className="cursor-pointer font-normal"
								>
									{isCredit
										? "Vincular a um cartão existente"
										: "Vincular a uma conta existente"}
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="link-mode-create" value="create" />
								<Label
									htmlFor="link-mode-create"
									className="cursor-pointer font-normal"
								>
									{isCredit ? "Criar um cartão novo" : "Criar uma conta nova"}
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="link-mode-ignore" value="ignore" />
								<Label
									htmlFor="link-mode-ignore"
									className="cursor-pointer font-normal"
								>
									Ignorar esta conta
								</Label>
							</div>
						</RadioGroup>

						{mode === "existing" ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="link-existing-target">
									{isCredit ? "Cartão" : "Conta"}
								</Label>
								<Select value={existingId} onValueChange={setExistingId}>
									<SelectTrigger id="link-existing-target" className="w-full">
										<SelectValue
											placeholder={
												isCredit ? "Selecione o cartão" : "Selecione a conta"
											}
										>
											{existingId &&
												(() => {
													const selected = targetOptions.find(
														(option) => option.id === existingId,
													);
													return selected ? (
														<AccountSelectContent
															label={selected.name}
															logo={selected.logo}
														/>
													) : null;
												})()}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{targetOptions.map((option) => (
											<SelectItem key={option.id} value={option.id}>
												<AccountSelectContent
													label={option.name}
													logo={option.logo}
												/>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}

						{mode === "create" ? (
							<div className="flex flex-col gap-5">
								<LogoPickerTrigger
									selectedLogo={
										isCredit ? cardFormState.logo : accountFormState.logo
									}
									disabled={logoOptions.length === 0}
									onOpen={() => {
										if (logoOptions.length > 0) {
											setLogoDialogOpen(true);
										}
									}}
								/>

								{isCredit ? (
									<CardFormFields
										values={cardFormState}
										accountOptions={accountOptions}
										onChange={updateCardField}
									/>
								) : (
									<AccountFormFields
										values={accountFormState}
										accountTypes={DEFAULT_ACCOUNT_TYPES as unknown as string[]}
										accountStatuses={
											DEFAULT_ACCOUNT_STATUS as unknown as string[]
										}
										onChange={updateAccountField}
										showInitialBalance={false}
									/>
								)}
							</div>
						) : null}

						{mode === "ignore" ? (
							<p className="text-sm text-muted-foreground">
								Nenhum lançamento será importado desta conta. Você pode voltar
								para pendente e vincular depois, quando quiser.
							</p>
						) : null}

						{errorMessage ? (
							<p className="text-sm text-destructive">{errorMessage}</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="button" onClick={handleConfirm} disabled={isPending}>
							{isPending
								? "Salvando..."
								: mode === "ignore"
									? "Ignorar conta"
									: "Vincular"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<LogoPickerDialog
				open={logoDialogOpen}
				logos={logoOptions}
				value={isCredit ? cardFormState.logo : accountFormState.logo}
				onOpenChange={setLogoDialogOpen}
				onSelect={
					isCredit ? handleCardLogoSelection : handleAccountLogoSelection
				}
			/>
		</>
	);
}
