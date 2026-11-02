"use client";

import {
	RiAlertLine,
	RiCheckLine,
	RiExpandUpDownLine,
	RiExternalLinkLine,
	RiSparklingLine,
} from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import type { AIProvider } from "@/features/insights/constants";
import type { InsightsModel } from "@/features/insights/lib/provider-models";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/shared/components/ui/command";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";

interface ModelSelectionCardProps {
	currentProvider: AIProvider;
	providerModels: InsightsModel[];
	selectValue: string;
	customModel: string;
	isCustomModelActive: boolean;
	canUseCustomModel: boolean;
	canAnalyze: boolean;
	listFailed: boolean;
	disabled?: boolean;
	onModelSelect: (modelId: string) => void;
	onCustomModelChange: (modelName: string) => void;
	onCancel?: () => void;
	onAnalyze: () => void;
}

export const CUSTOM_MODEL_VALUE = "custom";

const CUSTOM_MODEL_LABEL = "Modelo customizado";

export function ModelSelectionCard({
	currentProvider,
	providerModels,
	selectValue,
	customModel,
	isCustomModelActive,
	canUseCustomModel,
	canAnalyze,
	listFailed,
	disabled,
	onModelSelect,
	onCustomModelChange,
	onCancel,
	onAnalyze,
}: ModelSelectionCardProps) {
	const [open, setOpen] = useState(false);

	const selectedLabel =
		providerModels.find((model) => model.id === selectValue)?.name ??
		(canUseCustomModel ? CUSTOM_MODEL_LABEL : "Selecione um modelo");

	const handleSelect = (modelId: string) => {
		onModelSelect(modelId);
		setOpen(false);
	};

	return (
		<Card className="border-border/70 bg-card/95 shadow-sm">
			<CardContent className="space-y-6">
				<div className="space-y-3">
					<div className="space-y-1">
						<h3 className="font-semibold text-sm">2. Modelo específico</h3>
						<p className="text-muted-foreground text-xs">
							Escolha o modelo do provedor selecionado para esta análise.
						</p>
					</div>

					<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
						<div className="flex min-w-0 flex-col gap-2 lg:flex-row">
							<div className="w-full lg:w-72">
								<Popover open={open} onOpenChange={setOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											aria-expanded={open}
											aria-label="Selecionar modelo"
											disabled={disabled}
											className="h-9 w-full justify-between border-border/70 bg-background font-normal"
										>
											<span className="truncate">{selectedLabel}</span>
											<RiExpandUpDownLine
												className="ml-2 size-4 shrink-0 opacity-50"
												aria-hidden="true"
											/>
										</Button>
									</PopoverTrigger>
									<PopoverContent
										className="w-(--radix-popover-trigger-width) p-0"
										align="start"
									>
										<Command>
											<CommandInput placeholder="Buscar modelo..." />
											<CommandList>
												<CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
												<CommandGroup>
													{providerModels.map((model) => (
														<CommandItem
															key={model.id}
															value={`${model.name} ${model.id}`}
															onSelect={() => handleSelect(model.id)}
															className="cursor-pointer"
														>
															<span className="truncate">{model.name}</span>
															{model.id === selectValue && (
																<RiCheckLine
																	className="ml-auto size-4"
																	aria-hidden="true"
																/>
															)}
														</CommandItem>
													))}
													{canUseCustomModel && (
														<CommandItem
															value={CUSTOM_MODEL_LABEL}
															onSelect={() => handleSelect(CUSTOM_MODEL_VALUE)}
															className="cursor-pointer"
														>
															{CUSTOM_MODEL_LABEL}
														</CommandItem>
													)}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>

							{isCustomModelActive && (
								<div className="w-full lg:w-72">
									<Input
										value={customModel}
										onChange={(event) =>
											onCustomModelChange(event.target.value)
										}
										placeholder={
											currentProvider === "openrouter"
												? "Ex: anthropic/claude-opus-4.8-fast"
												: "Ex: llama3.2"
										}
										disabled={disabled}
										className="h-9 w-full border-border/70 bg-background"
									/>
								</div>
							)}
						</div>

						<div className="flex min-h-9 shrink-0 items-center text-muted-foreground text-xs lg:max-w-none">
							{currentProvider === "openrouter" && (
								<Link
									href="https://openrouter.ai/models"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
								>
									<RiExternalLinkLine className="size-3" />
									Ver modelos do OpenRouter
								</Link>
							)}

							{currentProvider === "ollama" && (
								<span>
									O modelo precisa estar instalado na instância Ollama
									configurada.
								</span>
							)}
						</div>
					</div>

					{listFailed && (
						<p className="flex items-center gap-1.5 text-warning text-xs">
							<RiAlertLine className="size-3 shrink-0" aria-hidden="true" />
							{providerModels.length > 0
								? "Não foi possível atualizar a lista de modelos. Exibindo a lista padrão."
								: "Não foi possível carregar a lista de modelos. Informe o modelo manualmente."}
						</p>
					)}
				</div>

				<div className="flex items-center justify-between gap-3">
					<Button
						disabled={disabled}
						onClick={onCancel}
						type="button"
						variant="outline"
					>
						Cancelar
					</Button>
					<Button onClick={onAnalyze} disabled={!canAnalyze}>
						<RiSparklingLine className="size-4" />
						{disabled ? "Analisando..." : "Gerar insights"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
