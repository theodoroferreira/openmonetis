"use client";
import { RiArrowDropDownLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import {
	createTransactionAction,
	fetchExchangeRateAction,
	updateTransactionAction,
} from "@/features/transactions/actions";
import {
	confirmAttachmentUploadAction,
	detachTransactionAttachmentAction,
	getPresignedUploadUrlAction,
} from "@/features/transactions/actions/attachments";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import {
	applyFieldDependencies,
	buildTransactionInitialState,
	deriveCreditCardPeriod,
} from "@/features/transactions/lib/form-helpers";
import { useAppPreferences } from "@/shared/components/providers/app-preferences-provider";
import { Button } from "@/shared/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import type { RateSource } from "@/shared/lib/exchange/constants";
import type { ExchangeRate } from "@/shared/lib/exchange/get-rate";
import { AttachmentFilePicker } from "../../attachments/attachment-file-picker";
import { AttachmentSection } from "../../attachments/attachment-section";
import { BasicFieldsSection } from "./basic-fields-section";
import { BoletoFieldsSection } from "./boleto-fields-section";
import { CategorySection } from "./category-section";
import { ConditionSection } from "./condition-section";
import { NoteSection } from "./note-section";
import { PayerSection } from "./payer-section";
import { PaymentMethodSection } from "./payment-method-section";
import type {
	FormState,
	TransactionDialogProps,
} from "./transaction-dialog-types";
import { TransactionSummaryCard } from "./transaction-summary-card";

/** Aceita "5,0918" e "5.0918". "" vira 0. */
function parseDecimalInput(value: string): number {
	return Number(value.trim().replace(",", "."));
}

/** Cotacao positiva e finita, ou null. */
function parseExchangeRate(value: string): number | null {
	const rate = parseDecimalInput(value);
	return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Taxa derivada (total / origem) com a precisao da coluna: numeric(18,8). */
function formatDerivedRate(rate: number): string {
	return String(Number(rate.toFixed(8)));
}

/**
 * Troca o total em reais repassando as dependencias do campo `amount`
 * (hoje: redistribuicao da divisao entre pessoas).
 */
function withAmount(state: FormState, amount: string): FormState {
	if (amount === state.amount) {
		return state;
	}
	return {
		...state,
		amount,
		...applyFieldDependencies("amount", amount, state),
	};
}

/** Total em reais = origem x cotacao. Sem cotacao valida, nao mexe no total. */
function withAmountFromRate(state: FormState): FormState {
	const rate = parseExchangeRate(state.exchangeRate);
	if (rate === null) {
		return state;
	}
	if (!state.originAmount.trim()) {
		return withAmount(state, "");
	}
	const origin = Number(state.originAmount);
	if (!Number.isFinite(origin)) {
		return state;
	}
	return withAmount(state, (origin * rate).toFixed(2));
}

/** Aplica o resultado da busca automatica; `null` = nenhuma fonte respondeu. */
function withFetchedRate(
	state: FormState,
	rate: ExchangeRate | null,
): FormState {
	if (!rate) {
		// Sem taxa o total tambem nao vale mais: o usuario informa um ou outro.
		return withAmount(
			{ ...state, exchangeRate: "", rateSource: "", rateDate: "" },
			"",
		);
	}
	return withAmountFromRate({
		...state,
		exchangeRate: String(rate.taxa),
		rateSource: rate.fonte,
		rateDate: rate.dataCotacao,
	});
}

export function TransactionDialog({
	mode,
	trigger,
	open,
	onOpenChange,
	payerOptions,
	splitPayerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
	estabelecimentos,
	transaction,
	defaultPeriod,
	defaultAccountId,
	defaultCardId,
	defaultPaymentMethod,
	defaultPurchaseDate,
	defaultName,
	defaultAmount,
	defaultCurrency,
	defaultOriginAmount,
	defaultRate,
	defaultRateSource,
	defaultCategoryId,
	defaultCondition,
	defaultInstallmentCount,
	defaultStartInstallment,
	lockCardSelection,
	lockPaymentMethod,
	isImporting,
	defaultTransactionType,
	forceShowTransactionType,
	onSuccess,
	maxSizeMb,
	onBulkEditRequest,
	onSplitEditRequest,
}: TransactionDialogProps) {
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const [formState, setFormState] = useState<FormState>(() =>
		buildTransactionInitialState(transaction, defaultPayerId, defaultPeriod, {
			defaultAccountId,
			defaultCardId,
			defaultPaymentMethod,
			defaultPurchaseDate,
			defaultName,
			defaultAmount,
			defaultCurrency,
			defaultOriginAmount,
			defaultRate,
			defaultRateSource,
			defaultTransactionType,
			defaultCategoryId,
			defaultCondition,
			defaultInstallmentCount,
			defaultStartInstallment,
			isImporting,
		}),
	);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [pendingDetachIds, setPendingDetachIds] = useState<string[]>([]);
	const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
	const [extrasOpen, setExtrasOpen] = useState(false);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const { showTransactionSummary } = useAppPreferences();
	const [isLoadingRate, setIsLoadingRate] = useState(false);
	// Id da ultima busca de cotacao: respostas de buscas anteriores sao
	// descartadas (troca rapida de moeda/data, reabertura do dialogo).
	const rateRequestIdRef = useRef(0);

	const cancelExchangeRateRequest = useCallback(() => {
		rateRequestIdRef.current += 1;
		setIsLoadingRate(false);
	}, []);

	const requestExchangeRate = useCallback((currency: string, date: string) => {
		rateRequestIdRef.current += 1;
		const requestId = rateRequestIdRef.current;
		setIsLoadingRate(true);

		fetchExchangeRateAction({ currency, date })
			.then((result) => (result.success ? (result.data ?? null) : null))
			.catch(() => null)
			.then((rate) => {
				if (requestId !== rateRequestIdRef.current) return;
				setIsLoadingRate(false);
				setFormState((prev) => withFetchedRate(prev, rate));
			});
	}, []);

	useEffect(() => {
		if (dialogOpen) {
			const initial = buildTransactionInitialState(
				transaction,
				defaultPayerId,
				defaultPeriod,
				{
					defaultAccountId,
					defaultCardId,
					defaultPaymentMethod,
					defaultPurchaseDate,
					defaultName,
					defaultAmount,
					defaultCurrency,
					defaultOriginAmount,
					defaultRate,
					defaultRateSource,
					defaultTransactionType,
					defaultCategoryId,
					defaultCondition,
					defaultInstallmentCount,
					defaultStartInstallment,
					isImporting,
				},
			);

			// Derive credit card period on open when cardId is pre-filled (create only)
			if (
				mode !== "update" &&
				initial.paymentMethod === "Cartão de crédito" &&
				initial.cardId &&
				initial.purchaseDate
			) {
				const card = cardOptions.find((opt) => opt.value === initial.cardId);
				if (card?.closingDay) {
					initial.period = deriveCreditCardPeriod(
						initial.purchaseDate,
						card.closingDay,
						card.dueDay,
					);
				}
			}

			setFormState(initial);
			cancelExchangeRateRequest();
			// Moeda estrangeira sem taxa (ex.: item da inbox que o banco nao
			// converteu): busca ao abrir. Taxa ja presente — lancamento salvo ou
			// cotacao do Pluggy — e mantida.
			if (
				initial.originCurrency !== "BRL" &&
				!initial.exchangeRate &&
				initial.purchaseDate
			) {
				requestExchangeRate(initial.originCurrency, initial.purchaseDate);
			}
			setErrorMessage(null);
			setPendingFiles([]);
			setPendingDetachIds([]);
			setPendingUploadFiles([]);
			setExtrasOpen(initial.condition !== "À vista");
		}
	}, [
		dialogOpen,
		transaction,
		defaultPayerId,
		defaultPeriod,
		defaultAccountId,
		defaultCardId,
		defaultPaymentMethod,
		defaultPurchaseDate,
		defaultName,
		defaultAmount,
		defaultCurrency,
		defaultOriginAmount,
		defaultRate,
		defaultRateSource,
		defaultTransactionType,
		defaultCategoryId,
		defaultCondition,
		defaultInstallmentCount,
		defaultStartInstallment,
		isImporting,
		cardOptions,
		mode,
		cancelExchangeRateRequest,
		requestExchangeRate,
	]);

	const categoryGroups = useMemo(() => {
		const filtered = categoryOptions.filter(
			(option) =>
				option.group?.toLowerCase() === formState.transactionType.toLowerCase(),
		);
		return groupAndSortCategories(filtered);
	}, [categoryOptions, formState.transactionType]);

	type CreateTransactionInput = Parameters<typeof createTransactionAction>[0];
	type UpdateTransactionInput = Parameters<typeof updateTransactionAction>[0];

	const totalAmount = useMemo(() => {
		const parsed = Number.parseFloat(formState.amount);
		return Number.isNaN(parsed) ? 0 : Math.abs(parsed);
	}, [formState.amount]);

	function getCardInfo(cardId: string | undefined) {
		if (!cardId) return null;
		const card = cardOptions.find((opt) => opt.value === cardId);
		if (!card) return null;
		return {
			closingDay: card.closingDay ?? null,
			dueDay: card.dueDay ?? null,
		};
	}

	function handleFieldChange<Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) {
		setFormState((prev) => {
			const effectiveCardId =
				key === "cardId" ? (value as string) : prev.cardId;
			const cardInfo = getCardInfo(effectiveCardId);

			const dependencies = applyFieldDependencies(key, value, prev, cardInfo);

			return {
				...prev,
				[key]: value,
				...dependencies,
			};
		});
	}

	/**
	 * Campos ligados ao cambio. Os recalculos ficam aqui, nos eventos, e nao
	 * num efeito sobre `originAmount`/`exchangeRate`: assim editar o total a
	 * mao nunca e desfeito por um recalculo automatico.
	 */
	function handleExchangeAwareFieldChange<Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) {
		const isForeign = formState.originCurrency !== "BRL";

		if (key === "originCurrency") {
			const currency = value as string;
			if (currency === formState.originCurrency) return;

			if (currency === "BRL") {
				// Os cinco campos saem em bloco (CHECK do banco). O numero digitado
				// no campo "Valor" continua o mesmo, agora em reais.
				cancelExchangeRateRequest();
				setFormState((prev) =>
					withAmount(
						{
							...prev,
							originCurrency: "BRL",
							originAmount: "",
							exchangeRate: "",
							rateSource: "",
							rateDate: "",
						},
						prev.originAmount,
					),
				);
				return;
			}

			// O numero digitado no campo "Valor" passa a ser o valor de origem.
			setFormState((prev) =>
				withAmount(
					{
						...prev,
						originCurrency: currency,
						originAmount:
							prev.originCurrency === "BRL" ? prev.amount : prev.originAmount,
						exchangeRate: "",
						rateSource: "",
						rateDate: "",
					},
					"",
				),
			);
			if (formState.purchaseDate) {
				requestExchangeRate(currency, formState.purchaseDate);
			} else {
				cancelExchangeRateRequest();
			}
			return;
		}

		if (key === "purchaseDate") {
			handleFieldChange(key, value);
			const date = value as string;
			// Cotacao do Pluggy e a que o banco cobrou: mudar a data nao a troca.
			if (isForeign && date && formState.rateSource !== "PLUGGY") {
				requestExchangeRate(formState.originCurrency, date);
			}
			return;
		}

		if (!isForeign) {
			handleFieldChange(key, value);
			return;
		}

		if (key === "originAmount") {
			const originAmount = value as string;
			setFormState((prev) => {
				const next = { ...prev, originAmount };
				if (parseExchangeRate(prev.exchangeRate) !== null) {
					return withAmountFromRate(next);
				}
				// Sem taxa mas com total informado: a taxa sai de total / origem.
				const origin = Number(originAmount);
				const total = Number(prev.amount);
				if (origin > 0 && total > 0) {
					return {
						...next,
						exchangeRate: formatDerivedRate(total / origin),
						rateSource: "MANUAL",
					};
				}
				return next;
			});
			return;
		}

		if (key === "exchangeRate") {
			const exchangeRate = value as string;
			setFormState((prev) =>
				withAmountFromRate({ ...prev, exchangeRate, rateSource: "MANUAL" }),
			);
			return;
		}

		if (key === "amount") {
			// Em moeda estrangeira `amount` so e escrito pelo campo "Total em
			// reais": a cotacao passa a ser total / origem.
			const total = value as string;
			setFormState((prev) => {
				const next = withAmount(prev, total);
				const origin = Number(prev.originAmount);
				const totalValue = Number(total);
				return {
					...next,
					exchangeRate:
						origin > 0 && totalValue > 0
							? formatDerivedRate(totalValue / origin)
							: "",
					rateSource: "MANUAL",
				};
			});
			return;
		}

		handleFieldChange(key, value);
	}

	function handleExtrasOpenChange(nextOpen: boolean) {
		setExtrasOpen(nextOpen);

		if (nextOpen) {
			requestAnimationFrame(() => {
				const scrollContainer = scrollContainerRef.current;
				if (!scrollContainer) return;

				scrollContainer.scrollTo({
					top: scrollContainer.scrollHeight,
					behavior: "smooth",
				});
			});
		}
	}

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!formState.purchaseDate) {
			const message = "Informe a data da transação.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (!formState.name.trim()) {
			const message = "Informe a descrição do lançamento.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.isSplit && !formState.payerId) {
			const message = "Selecione a pessoa principal para dividir o lançamento.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const amountValue = Number(formState.amount);
		if (Number.isNaN(amountValue)) {
			const message = "Informe um valor válido.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const isForeign = formState.originCurrency !== "BRL";
		const rateValue = parseExchangeRate(formState.exchangeRate);

		if (isForeign && rateValue === null) {
			const message =
				"Informe a cotação da moeda — não foi possível obtê-la automaticamente.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		// Os cinco campos vao juntos ou todos nulos (CHECK do banco).
		const exchangeFields = {
			originCurrency: isForeign ? formState.originCurrency : null,
			originAmount: isForeign
				? Math.abs(Number(formState.originAmount) || 0)
				: null,
			exchangeRate: isForeign ? rateValue : null,
			rateSource: isForeign
				? ((formState.rateSource || "MANUAL") as RateSource)
				: null,
			rateDate: isForeign ? formState.rateDate || formState.purchaseDate : null,
		};

		const sanitizedAmount = Math.abs(amountValue);
		const normalizedSplitShares = formState.isSplit
			? [
					{
						payerId: formState.payerId ?? "",
						amount: Number.parseFloat(formState.primarySplitAmount) || 0,
					},
					...formState.splitShares.map((share) => ({
						payerId: share.payerId,
						amount: Number.parseFloat(share.amount) || 0,
					})),
				]
			: undefined;

		if (formState.isSplit) {
			if (formState.splitShares.length === 0) {
				const message = "Selecione pelo menos uma pessoa para dividir.";
				setErrorMessage(message);
				toast.error(message);
				return;
			}

			if (normalizedSplitShares?.some((share) => share.amount <= 0)) {
				const message = "Informe um valor maior que zero para cada pessoa.";
				setErrorMessage(message);
				toast.error(message);
				return;
			}

			const splitTotal =
				normalizedSplitShares?.reduce((sum, share) => sum + share.amount, 0) ??
				0;
			if (Math.abs(splitTotal - sanitizedAmount) > 0.01) {
				const message = "A soma das divisões deve ser igual ao valor total.";
				setErrorMessage(message);
				toast.error(message);
				return;
			}
		}

		if (!formState.categoryId) {
			const message = "Selecione uma categoria.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.paymentMethod === "Cartão de crédito") {
			if (!formState.cardId) {
				const message = "Selecione o cartão.";
				setErrorMessage(message);
				toast.error(message);
				return;
			}
		} else if (!formState.accountId) {
			const message = "Selecione a conta.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const payload: CreateTransactionInput = {
			purchaseDate: formState.purchaseDate,
			period: formState.period,
			name: formState.name.trim(),
			transactionType:
				formState.transactionType as CreateTransactionInput["transactionType"],
			amount: sanitizedAmount,
			...exchangeFields,
			condition: formState.condition as CreateTransactionInput["condition"],
			paymentMethod:
				formState.paymentMethod as CreateTransactionInput["paymentMethod"],
			payerId: formState.payerId ?? null,
			splitShares: normalizedSplitShares,
			isSplit: formState.isSplit,
			primarySplitAmount: formState.isSplit
				? Number.parseFloat(formState.primarySplitAmount) || undefined
				: undefined,
			secondarySplitAmount: formState.isSplit
				? Number.parseFloat(formState.secondarySplitAmount) || undefined
				: undefined,
			accountId: formState.accountId ?? null,
			cardId: formState.cardId ?? null,
			categoryId: formState.categoryId ?? null,
			note: formState.note.trim() || null,
			isSettled:
				formState.paymentMethod === "Cartão de crédito"
					? null
					: Boolean(formState.isSettled),
			installmentCount:
				formState.condition === "Parcelado" && formState.installmentCount
					? Number(formState.installmentCount)
					: undefined,
			startInstallment:
				mode === "create" &&
				formState.condition === "Parcelado" &&
				formState.startInstallment
					? Number(formState.startInstallment)
					: undefined,
			recurrenceCount:
				formState.condition === "Recorrente" && formState.recurrenceCount
					? Number(formState.recurrenceCount)
					: undefined,
			dueDate:
				formState.paymentMethod === "Boleto" && formState.dueDate
					? formState.dueDate
					: undefined,
			boletoPaymentDate:
				mode === "update" &&
				formState.paymentMethod === "Boleto" &&
				formState.boletoPaymentDate
					? formState.boletoPaymentDate
					: undefined,
			importFromTransactionId:
				mode === "create" && isImporting && transaction?.id
					? transaction.id
					: undefined,
		};

		startTransition(async () => {
			if (mode === "create") {
				const result = await createTransactionAction(payload);

				if (result.success) {
					if (pendingFiles.length > 0 && result.data?.ids?.length) {
						const firstId = result.data.ids[0];
						const isNewSeries =
							formState.condition === "Parcelado" ||
							formState.condition === "Recorrente";
						for (const file of pendingFiles) {
							const presign = await getPresignedUploadUrlAction({
								fileName: file.name,
								mimeType: file.type,
								fileSize: file.size,
								transactionId: firstId,
							});
							if (presign.success) {
								await fetch(presign.presignedUrl, {
									method: "PUT",
									body: file,
									headers: { "Content-Type": file.type },
								});
								await confirmAttachmentUploadAction({
									uploadToken: presign.uploadToken,
									scope: isNewSeries ? "all" : "current",
								});
							}
						}
					}
					toast.success(result.message);
					onSuccess?.();
					setDialogOpen(false);
					return;
				}

				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			const hasSeriesId = Boolean(transaction?.seriesId);
			const hasSplitPair = Boolean(
				transaction?.isDivided &&
					transaction?.splitGroupId &&
					!transaction?.seriesId,
			);

			if (hasSeriesId && onBulkEditRequest) {
				// Para lançamentos em série, passa os arquivos para a página confirmar
				// o upload após o escopo ser escolhido (sem upload antecipado ao S3)
				onBulkEditRequest({
					id: transaction?.id ?? "",
					purchaseDate: formState.purchaseDate,
					period: formState.period,
					name: formState.name.trim(),
					categoryId: formState.categoryId,
					note: formState.note.trim() || "",
					payerId: formState.payerId,
					accountId: formState.accountId,
					cardId: formState.cardId,
					amount: sanitizedAmount,
					dueDate:
						formState.paymentMethod === "Boleto"
							? formState.dueDate || null
							: null,
					boletoPaymentDate:
						mode === "update" && formState.paymentMethod === "Boleto"
							? formState.boletoPaymentDate || null
							: null,
					isSettled:
						formState.paymentMethod === "Cartão de crédito"
							? null
							: Boolean(formState.isSettled),
					pendingDetachIds,
					pendingUploadFiles,
				});
				return;
			}

			if (hasSplitPair && onSplitEditRequest) {
				onSplitEditRequest({
					id: transaction?.id ?? "",
					purchaseDate: formState.purchaseDate,
					period: formState.period,
					name: formState.name.trim(),
					transactionType: formState.transactionType,
					amount: sanitizedAmount,
					condition: formState.condition,
					paymentMethod: formState.paymentMethod,
					categoryId: formState.categoryId,
					note: formState.note.trim() || "",
					payerId: formState.payerId,
					accountId: formState.accountId,
					cardId: formState.cardId,
					isSettled:
						formState.paymentMethod === "Cartão de crédito"
							? null
							: Boolean(formState.isSettled),
					dueDate:
						formState.paymentMethod === "Boleto"
							? formState.dueDate || null
							: null,
					boletoPaymentDate:
						mode === "update" && formState.paymentMethod === "Boleto"
							? formState.boletoPaymentDate || null
							: null,
					...exchangeFields,
					pendingDetachIds,
					pendingUploadFiles,
				});
				return;
			}

			// Atualização normal para lançamentos únicos
			const updatePayload: UpdateTransactionInput = {
				id: transaction?.id ?? "",
				...payload,
			};

			const result = await updateTransactionAction(updatePayload);

			if (result.success) {
				for (const attachmentId of pendingDetachIds) {
					await detachTransactionAttachmentAction({
						attachmentId,
						transactionId: transaction?.id ?? "",
					});
				}
				for (const file of pendingUploadFiles) {
					const presign = await getPresignedUploadUrlAction({
						fileName: file.name,
						mimeType: file.type,
						fileSize: file.size,
						transactionId: transaction?.id ?? "",
					});
					if (presign.success) {
						await fetch(presign.presignedUrl, {
							method: "PUT",
							body: file,
							headers: { "Content-Type": file.type },
						});
						await confirmAttachmentUploadAction({
							uploadToken: presign.uploadToken,
							scope: "current",
						});
					}
				}
				toast.success(result.message);
				onSuccess?.();
				setDialogOpen(false);
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	const isCopyMode = mode === "create" && Boolean(transaction) && !isImporting;
	const isImportMode = mode === "create" && Boolean(transaction) && isImporting;
	const isNewWithType =
		mode === "create" && !transaction && defaultTransactionType;

	const title =
		mode === "create"
			? isImportMode
				? "Importar para Minha Conta"
				: isCopyMode
					? "Copiar lançamento"
					: isNewWithType
						? defaultTransactionType === "Despesa"
							? "Nova Despesa"
							: "Nova Receita"
						: "Novo lançamento"
			: "Atualizar lançamento";
	const description =
		mode === "create"
			? isImportMode
				? "Importando lançamento de outro usuário. Ajuste a categoria, pessoa e cartão/conta antes de salvar."
				: isCopyMode
					? "Os dados do lançamento foram copiados. Revise e ajuste conforme necessário antes de salvar."
					: isNewWithType
						? `Informe os dados abaixo para registrar ${defaultTransactionType === "Despesa" ? "uma nova despesa" : "uma nova receita"}.`
						: "Informe os dados abaixo para registrar um novo lançamento."
			: "Atualize as informações do lançamento selecionado.";
	const submitLabel = mode === "create" ? "Salvar" : "Atualizar";

	const showInstallments = formState.condition === "Parcelado";
	const showRecurrence = formState.condition === "Recorrente";
	const showDueDate = formState.paymentMethod === "Boleto";
	const showPaymentDate = mode === "update" && showDueDate;
	const showSettledToggle = formState.paymentMethod !== "Cartão de crédito";
	const isUpdateMode = mode === "update";
	const disablePaymentMethod = Boolean(lockPaymentMethod && mode === "create");
	const disableCardSelect = Boolean(lockCardSelection && mode === "create");
	// Moeda estrangeira: nada de salvar durante a busca nem sem cotacao valida.
	const isSaveBlockedByRate =
		formState.originCurrency !== "BRL" &&
		(isLoadingRate || parseExchangeRate(formState.exchangeRate) === null);

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="flex max-h-[90vh] min-w-0 flex-col overflow-hidden p-4 sm:p-10">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
					onSubmit={handleSubmit}
					noValidate
				>
					<div
						ref={scrollContainerRef}
						className="-mx-1 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-1"
					>
						{/* Detalhes */}
						<div className="space-y-3">
							<BasicFieldsSection
								formState={formState}
								onFieldChange={handleExchangeAwareFieldChange}
								estabelecimentos={estabelecimentos}
								isLoadingRate={isLoadingRate}
							/>

							<CategorySection
								formState={formState}
								onFieldChange={handleFieldChange}
								categoryOptions={categoryOptions}
								categoryGroups={categoryGroups}
								isUpdateMode={isUpdateMode}
								hideTransactionType={
									Boolean(isNewWithType) && !forceShowTransactionType
								}
							/>
						</div>

						<div className="border-t border-border/40 my-3" />

						{/* Pessoa */}
						<PayerSection
							formState={formState}
							onFieldChange={handleFieldChange}
							payerOptions={payerOptions}
							splitPayerOptions={splitPayerOptions}
							totalAmount={totalAmount}
						/>

						<div className="border-t border-border/40 my-3" />

						{/* Pagamento */}
						<div className="space-y-3">
							<PaymentMethodSection
								formState={formState}
								onFieldChange={handleFieldChange}
								accountOptions={accountOptions}
								cardOptions={cardOptions}
								isUpdateMode={isUpdateMode}
								disablePaymentMethod={disablePaymentMethod}
								disableCardSelect={disableCardSelect}
								showSettledToggle={showSettledToggle}
							/>

							{showDueDate ? (
								<BoletoFieldsSection
									formState={formState}
									onFieldChange={handleFieldChange}
									showPaymentDate={showPaymentDate}
								/>
							) : null}
						</div>

						{/* Extras */}
						{isUpdateMode ? (
							<>
								<div className="border-t border-border/40 my-3" />
								<div className="space-y-3">
									<NoteSection
										formState={formState}
										onFieldChange={handleFieldChange}
									/>
									<div className="space-y-2">
										<Label className="text-xs font-medium leading-none">
											Anexos
										</Label>
										<AttachmentSection
											transactionId={transaction?.id ?? ""}
											maxSizeMb={maxSizeMb}
											pendingDetachIds={pendingDetachIds}
											onPendingDetach={(id) =>
												setPendingDetachIds((prev) => [...prev, id])
											}
											onUndoPendingDetach={(id) =>
												setPendingDetachIds((prev) =>
													prev.filter((x) => x !== id),
												)
											}
											pendingUploadFiles={pendingUploadFiles}
											onPendingUpload={(file) =>
												setPendingUploadFiles((prev) => [...prev, file])
											}
											onCancelPendingUpload={(file) =>
												setPendingUploadFiles((prev) =>
													prev.filter((f) => f !== file),
												)
											}
										/>
									</div>
								</div>
							</>
						) : (
							<Collapsible
								open={extrasOpen}
								onOpenChange={handleExtrasOpenChange}
								className="min-w-0"
							>
								<CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer [&[data-state=open]>svg]:rotate-180 mt-4">
									<RiArrowDropDownLine
										className="text-primary size-4 transition-transform duration-200"
										aria-hidden
									/>
									Condições, anotações e anexos
								</CollapsibleTrigger>
								<CollapsibleContent className="min-w-0 overflow-hidden space-y-3 pt-3">
									<ConditionSection
										formState={formState}
										onFieldChange={handleFieldChange}
										showInstallments={showInstallments}
										showRecurrence={showRecurrence}
									/>
									<NoteSection
										formState={formState}
										onFieldChange={handleFieldChange}
									/>
									{isImportMode && transaction?.id && (
										<div className="space-y-2">
											<Label className="text-xs font-medium leading-none">
												Anexos que serão copiados
											</Label>
											<AttachmentSection
												transactionId={transaction.id}
												readonly
											/>
										</div>
									)}
									<AttachmentFilePicker
										files={pendingFiles}
										onAdd={(file) => setPendingFiles((prev) => [...prev, file])}
										onRemove={(file) =>
											setPendingFiles((prev) => prev.filter((f) => f !== file))
										}
										maxSizeMb={maxSizeMb}
									/>
								</CollapsibleContent>
							</Collapsible>
						)}

						{showTransactionSummary ? (
							<div className="mt-3">
								<TransactionSummaryCard
									formState={formState}
									payerOptions={payerOptions}
									accountOptions={accountOptions}
									cardOptions={cardOptions}
									categoryOptions={categoryOptions}
								/>
							</div>
						) : null}
					</div>

					{errorMessage ? (
						<p className="mt-3 text-sm text-destructive">{errorMessage}</p>
					) : null}

					<DialogFooter className="mt-4 shrink-0">
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending || isSaveBlockedByRate}>
							{isPending ? "Salvando..." : submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
