import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ator não-humano: permite que Server Actions rodem fora de uma sessão de
 * navegador, com as mesmas validações e revalidações.
 *
 * `runAsActor` só deve ser chamado pela rota `/api/mcp`, depois de validar o
 * token. Este módulo não é `"use server"`, então o navegador não consegue
 * definir um ator.
 */
export type Actor = {
	kind: "mcp";
	tokenId: string;
	user: {
		id: string;
		name: string;
		email: string;
	};
};

const actorStorage = new AsyncLocalStorage<Actor>();

export function runAsActor<T>(actor: Actor, callback: () => T): T {
	return actorStorage.run(actor, callback);
}

export function getActor(): Actor | null {
	return actorStorage.getStore() ?? null;
}
