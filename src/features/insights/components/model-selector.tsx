"use client";

import { useEffect, useMemo, useState } from "react";
import type { AIProvider } from "@/features/insights/constants";
import {
	type InsightsModel,
	type InsightsProviderOption,
	inferProviderFromModelId,
	isCustomModelProvider,
	stripCustomProviderPrefix,
} from "@/features/insights/lib/provider-models";
import { AnalysisSummaryCard } from "./analysis-summary-card";
import { CUSTOM_MODEL_VALUE, ModelSelectionCard } from "./model-selection-card";
import {
	NoProviderConfiguredCard,
	ProviderSelectionCard,
} from "./provider-selection-card";

interface ModelSelectorProps {
	providers: InsightsProviderOption[];
	value: string;
	onValueChange: (value: string) => void;
	period: string;
	onAnalyze: () => void;
	userInstructions: string;
	onUserInstructionsChange: (value: string) => void;
	onCancel?: () => void;
	disabled?: boolean;
	isLoadingSavedInsights?: boolean;
}

function getCustomModelName(value: string) {
	const provider = inferProviderFromModelId(value);
	return provider ? stripCustomProviderPrefix(value, provider) : value;
}

export function ModelSelector({
	providers,
	value,
	onValueChange,
	period,
	onAnalyze,
	userInstructions,
	onUserInstructionsChange,
	onCancel,
	disabled,
	isLoadingSavedInsights,
}: ModelSelectorProps) {
	const [customModel, setCustomModel] = useState(() =>
		getCustomModelName(value),
	);

	useEffect(() => {
		setCustomModel(getCustomModelName(value));
	}, [value]);

	const allModels = useMemo(
		() => providers.flatMap((option) => option.models),
		[providers],
	);

	const inferredProvider = inferProviderFromModelId(value);
	const currentOption =
		providers.find((option) => option.provider === inferredProvider) ??
		providers[0];

	if (!currentOption) {
		return <NoProviderConfiguredCard />;
	}

	const currentProvider = currentOption.provider;
	const providerModels: InsightsModel[] = currentOption.models;
	const selectedModelIsKnown = providerModels.some(
		(model) => model.id === value,
	);
	const selectValue = selectedModelIsKnown ? value : CUSTOM_MODEL_VALUE;
	const isCustomModelActive =
		isCustomModelProvider(currentProvider) && !selectedModelIsKnown;
	const selectedModelLabel =
		allModels.find((model) => model.id === value)?.name ??
		getCustomModelName(value);
	const canAnalyze =
		!disabled &&
		!isLoadingSavedInsights &&
		selectedModelLabel.trim().length > 0;

	const handleProviderChange = (newProvider: AIProvider) => {
		const firstModel = providers.find(
			(option) => option.provider === newProvider,
		)?.models[0];

		onValueChange(firstModel ? firstModel.id : `${newProvider}:`);
	};

	const handleModelSelect = (modelId: string) => {
		if (modelId === CUSTOM_MODEL_VALUE) {
			setCustomModel("");
			onValueChange(`${currentProvider}:`);
			return;
		}

		onValueChange(modelId);
	};

	const handleCustomModelChange = (modelName: string) => {
		setCustomModel(modelName);
		onValueChange(`${currentProvider}:${modelName}`);
	};

	return (
		<section className="space-y-4">
			<div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="space-y-4">
					<ProviderSelectionCard
						providers={providers.map((option) => option.provider)}
						currentProvider={currentProvider}
						disabled={disabled}
						onProviderChange={handleProviderChange}
					/>

					<ModelSelectionCard
						currentProvider={currentProvider}
						providerModels={providerModels}
						selectValue={selectValue}
						customModel={customModel}
						isCustomModelActive={isCustomModelActive}
						canUseCustomModel={isCustomModelProvider(currentProvider)}
						canAnalyze={canAnalyze}
						listFailed={currentOption.listFailed}
						disabled={disabled}
						onModelSelect={handleModelSelect}
						onCustomModelChange={handleCustomModelChange}
						onCancel={onCancel}
						onAnalyze={onAnalyze}
					/>
				</div>

				<AnalysisSummaryCard
					period={period}
					currentProvider={currentProvider}
					selectedModelLabel={selectedModelLabel}
					userInstructions={userInstructions}
					onUserInstructionsChange={onUserInstructionsChange}
				/>
			</div>
		</section>
	);
}
