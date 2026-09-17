import { z } from "zod";

/** Resposta de POST /auth */
export const pluggyAuthResponseSchema = z.object({
	apiKey: z.string().min(1),
});

/** Conector (instituição). O Meu Pluggy é o conector 200. */
export const pluggyConnectorSchema = z.object({
	id: z.number().int(),
	name: z.string(),
});

/** Resposta de GET /items/{id} — apenas os campos que usamos. */
export const pluggyItemSchema = z.object({
	id: z.string().uuid(),
	status: z.string(),
	connector: pluggyConnectorSchema,
	updatedAt: z.string().optional(),
});

export type PluggyItem = z.infer<typeof pluggyItemSchema>;
