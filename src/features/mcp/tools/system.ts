import { z } from "zod";
import { defineTool } from "../lib/define-tool";

export const systemTools = [
	defineTool({
		name: "ping",
		title: "Testar conexão",
		description:
			"Confirma que o servidor responde e qual conta está conectada.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => ({
			ok: true,
			userId,
			serverTime: new Date().toISOString(),
		}),
	}),
];
