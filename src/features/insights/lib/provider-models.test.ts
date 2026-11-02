import { describe, expect, it } from "vitest";
import {
	collectPages,
	getConfiguredProviders,
	type InsightsProviderOption,
	inferProviderFromModelId,
	normalizeAnthropicModels,
	normalizeBaseUrl,
	normalizeGoogleModels,
	normalizeMinimaxModels,
	normalizeOllamaModels,
	normalizeOpenAIModels,
	normalizeOpenRouterModels,
	pickDefaultModel,
	resolveInitialModel,
	routeInsightsModel,
} from "./provider-models";

const google: InsightsProviderOption = {
	provider: "google",
	listFailed: false,
	models: [
		{ id: "gemini-9-pro", name: "Gemini 9 Pro", provider: "google" },
		{ id: "gemini-9-flash", name: "Gemini 9 Flash", provider: "google" },
	],
};

const openai: InsightsProviderOption = {
	provider: "openai",
	listFailed: false,
	models: [{ id: "gpt-5.5", name: "gpt-5.5", provider: "openai" }],
};

const openrouterSemLista: InsightsProviderOption = {
	provider: "openrouter",
	listFailed: true,
	models: [],
};

const ollama: InsightsProviderOption = {
	provider: "ollama",
	listFailed: false,
	models: [{ id: "ollama:llama3.2", name: "llama3.2", provider: "ollama" }],
};

describe("getConfiguredProviders", () => {
	it("retorna apenas provedores com segredo definido", () => {
		expect(
			getConfiguredProviders({ GOOGLE_GENERATIVE_AI_API_KEY: "k" }),
		).toEqual(["google"]);
	});

	it("trata valor vazio ou so com espacos como ausente", () => {
		expect(
			getConfiguredProviders({
				OPENAI_API_KEY: "",
				ANTHROPIC_API_KEY: "   ",
				GOOGLE_GENERATIVE_AI_API_KEY: undefined,
			}),
		).toEqual([]);
	});

	it("usa OLLAMA_BASE_URL para o Ollama, nao OLLAMA_API_KEY", () => {
		expect(getConfiguredProviders({ OLLAMA_API_KEY: "k" })).toEqual([]);
		expect(
			getConfiguredProviders({ OLLAMA_BASE_URL: "http://x:11434/v1" }),
		).toEqual(["ollama"]);
	});

	it("preserva a ordem de exibicao dos provedores", () => {
		expect(
			getConfiguredProviders({
				OPENROUTER_API_KEY: "k",
				OPENAI_API_KEY: "k",
			}),
		).toEqual(["openai", "openrouter"]);
	});
});

describe("normalizeGoogleModels", () => {
	const model = (name: string, methods = ["generateContent"]) => ({
		name: `models/${name}`,
		displayName: name.toUpperCase(),
		supportedGenerationMethods: methods,
	});

	it("remove o prefixo models/ e usa o displayName", () => {
		expect(
			normalizeGoogleModels({ models: [model("gemini-3-flash")] }),
		).toEqual([
			{ id: "gemini-3-flash", name: "GEMINI-3-FLASH", provider: "google" },
		]);
	});

	it("descarta modelo sem generateContent", () => {
		expect(
			normalizeGoogleModels({
				models: [model("gemini-3-flash", ["countTokens"])],
			}),
		).toEqual([]);
	});

	it.each([
		"gemini-embedding-001",
		"gemini-3-pro-tts",
		"gemini-3-flash-image",
		"gemini-3-flash-native-audio",
		"gemini-3-flash-live",
		"gemini-robotics-er",
	])("descarta o modelo nao textual %s", (name) => {
		expect(normalizeGoogleModels({ models: [model(name)] })).toEqual([]);
	});

	it("descarta modelo fora da familia gemini", () => {
		expect(normalizeGoogleModels({ models: [model("aqa")] })).toEqual([]);
	});

	it("ordena do mais novo para o mais antigo com comparacao numerica", () => {
		const ids = normalizeGoogleModels({
			models: [model("gemini-9-flash"), model("gemini-10-flash")],
		}).map((m) => m.id);

		expect(ids).toEqual(["gemini-10-flash", "gemini-9-flash"]);
	});

	it("aceita resposta sem lista de modelos", () => {
		expect(normalizeGoogleModels({})).toEqual([]);
	});

	it("rejeita resposta malformada para acionar o fallback", () => {
		expect(() => normalizeGoogleModels({ models: "x" })).toThrow();
	});
});

describe("normalizeOpenAIModels", () => {
	it("mantem apenas modelos de texto", () => {
		const ids = normalizeOpenAIModels({
			data: [
				{ id: "gpt-5.5" },
				{ id: "o3-mini" },
				{ id: "chatgpt-4o-latest" },
				{ id: "gpt-4o-audio-preview" },
				{ id: "gpt-4o-realtime-preview" },
				{ id: "gpt-4o-mini-tts" },
				{ id: "gpt-4o-transcribe" },
				{ id: "gpt-image-1" },
				{ id: "gpt-4o-search-preview" },
				{ id: "text-embedding-3-small" },
				{ id: "gpt-3.5-turbo-instruct" },
				{ id: "dall-e-3" },
				{ id: "whisper-1" },
			],
		}).map((m) => m.id);

		expect(ids.sort()).toEqual(["chatgpt-4o-latest", "gpt-5.5", "o3-mini"]);
	});
});

describe("normalizeAnthropicModels", () => {
	it("usa o display_name", () => {
		expect(
			normalizeAnthropicModels({
				data: [{ id: "claude-x", display_name: "Claude X" }],
			}),
		).toEqual([{ id: "claude-x", name: "Claude X", provider: "anthropic" }]);
	});
});

describe("normalizeMinimaxModels", () => {
	it("mantem apenas a familia MiniMax", () => {
		expect(
			normalizeMinimaxModels({
				data: [{ id: "MiniMax-M3" }, { id: "speech-02" }],
			}),
		).toEqual([{ id: "MiniMax-M3", name: "MiniMax-M3", provider: "minimax" }]);
	});
});

describe("normalizeOpenRouterModels", () => {
	it("prefixa o ID salvo e mantem o nome", () => {
		expect(
			normalizeOpenRouterModels({
				data: [{ id: "autor/modelo", name: "Autor: Modelo" }],
			}),
		).toEqual([
			{
				id: "openrouter:autor/modelo",
				name: "Autor: Modelo",
				provider: "openrouter",
			},
		]);
	});
});

describe("normalizeOllamaModels", () => {
	it("prefixa o ID salvo e remove modelos de embedding", () => {
		expect(
			normalizeOllamaModels({
				data: [{ id: "llama3.2" }, { id: "nomic-embed-text" }],
			}),
		).toEqual([
			{ id: "ollama:llama3.2", name: "llama3.2", provider: "ollama" },
		]);
	});
});

describe("collectPages", () => {
	it("acumula paginas ate nao haver cursor", async () => {
		const cursors: Array<string | undefined> = [];

		const items = await collectPages(async (cursor) => {
			cursors.push(cursor);
			return cursor
				? { items: ["b"] }
				: { items: ["a"], nextCursor: "pagina-2" };
		});

		expect(items).toEqual(["a", "b"]);
		expect(cursors).toEqual([undefined, "pagina-2"]);
	});

	it("nao fica em loop se a API repetir o cursor para sempre", async () => {
		const items = await collectPages(async () => ({
			items: ["a"],
			nextCursor: "sempre-o-mesmo",
		}));

		expect(items.length).toBeLessThanOrEqual(20);
	});
});

describe("normalizeBaseUrl", () => {
	it("remove espacos e barras finais", () => {
		expect(normalizeBaseUrl(" http://x:11434/v1/ ")).toBe("http://x:11434/v1");
	});
});

describe("inferProviderFromModelId", () => {
	it.each([
		["gpt-5.5", "openai"],
		["o3-mini", "openai"],
		["claude-haiku-4-5-20251001", "anthropic"],
		["gemini-3-flash-preview", "google"],
		["MiniMax-M2.7", "minimax"],
		["openrouter:autor/modelo", "openrouter"],
		["autor/modelo", "openrouter"],
		["ollama:hf.co/autor/modelo", "ollama"],
	])("reconhece o ID salvo %s", (id, provider) => {
		expect(inferProviderFromModelId(id)).toBe(provider);
	});

	it("nao reconhece ID desconhecido", () => {
		expect(inferProviderFromModelId("modelo-qualquer")).toBeNull();
	});
});

describe("pickDefaultModel", () => {
	it("prefere o modelo padrao quando disponivel", () => {
		expect(pickDefaultModel([google, openai])).toBe("gpt-5.5");
	});

	it("usa o primeiro modelo do primeiro provedor sem o padrao", () => {
		expect(pickDefaultModel([google])).toBe("gemini-9-pro");
	});

	it("pula provedor sem modelos", () => {
		expect(pickDefaultModel([openrouterSemLista, google])).toBe("gemini-9-pro");
	});

	it("abre o ID customizado quando so resta provedor sem lista", () => {
		expect(pickDefaultModel([openrouterSemLista])).toBe("openrouter:");
	});

	it("retorna null sem provedores", () => {
		expect(pickDefaultModel([])).toBeNull();
	});
});

describe("resolveInitialModel", () => {
	it("mantem o modelo salvo que continua listado", () => {
		expect(resolveInitialModel("gemini-9-flash", [google])).toBe(
			"gemini-9-flash",
		);
	});

	it("cai no padrao se o provedor salvo nao esta configurado", () => {
		expect(resolveInitialModel("gpt-5.5", [google])).toBe("gemini-9-pro");
	});

	it("cai no padrao se o modelo salvo saiu da lista", () => {
		expect(resolveInitialModel("gemini-1-velho", [google])).toBe(
			"gemini-9-pro",
		);
	});

	it("mantem ID customizado de provedor que aceita ID livre", () => {
		expect(resolveInitialModel("ollama:meu-modelo", [ollama])).toBe(
			"ollama:meu-modelo",
		);
	});

	it("usa o padrao sem modelo salvo", () => {
		expect(resolveInitialModel(null, [google])).toBe("gemini-9-pro");
	});
});

describe("routeInsightsModel", () => {
	it("aceita modelo listado", () => {
		expect(routeInsightsModel("gemini-9-pro", [google])).toEqual({
			success: true,
			provider: "google",
			modelId: "gemini-9-pro",
		});
	});

	it("rejeita modelo fora da lista do provedor", () => {
		expect(routeInsightsModel("gemini-nao-listado", [google])).toEqual({
			success: false,
			error: "Modelo inválido.",
		});
	});

	it("rejeita provedor nao configurado", () => {
		expect(routeInsightsModel("gpt-5.5", [google])).toEqual({
			success: false,
			error: "Provedor não configurado no .env.",
		});
	});

	it("rejeita ID desconhecido", () => {
		expect(routeInsightsModel("modelo-qualquer", [google])).toEqual({
			success: false,
			error: "Modelo inválido.",
		});
	});

	it("aceita ID livre do Ollama sem o prefixo", () => {
		expect(routeInsightsModel("ollama:meu-modelo", [ollama])).toEqual({
			success: true,
			provider: "ollama",
			modelId: "meu-modelo",
		});
	});

	it("aceita ID livre do OpenRouter com e sem prefixo", () => {
		const expected = {
			success: true,
			provider: "openrouter",
			modelId: "autor/modelo",
		};

		expect(
			routeInsightsModel("openrouter:autor/modelo", [openrouterSemLista]),
		).toEqual(expected);
		expect(routeInsightsModel("autor/modelo", [openrouterSemLista])).toEqual(
			expected,
		);
	});

	it("rejeita ID customizado vazio", () => {
		expect(routeInsightsModel("ollama:", [ollama])).toEqual({
			success: false,
			error: "Informe um modelo válido do Ollama.",
		});
		expect(routeInsightsModel("openrouter:", [openrouterSemLista])).toEqual({
			success: false,
			error: "Informe um modelo válido do OpenRouter.",
		});
	});
});
