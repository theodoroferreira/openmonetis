import { z } from "zod";
import {
	archiveNoteAction,
	createNoteAction,
	deleteNoteAction,
	updateNoteAction,
} from "@/features/notes/actions";
import { fetchAllNotesForUser } from "@/features/notes/queries";
import { defineTool } from "../lib/define-tool";
import { uuid } from "./schemas";

const noteFields = {
	title: z.string().min(1).max(30),
	description: z.string().max(350).optional(),
	type: z.enum(["nota", "tarefa"]),
	tasks: z
		.array(
			z.object({
				id: z.string(),
				text: z.string().min(1),
				completed: z.boolean(),
			}),
		)
		.optional(),
};

export const noteTools = [
	defineTool({
		name: "list_notes",
		title: "Listar anotações",
		description: "Lista anotações ativas e arquivadas.",
		kind: "read",
		input: z.object({}),
		handler: async (_args, { userId }) => fetchAllNotesForUser(userId),
	}),

	defineTool({
		name: "create_note",
		title: "Criar anotação",
		description: "Cria uma nota ou uma lista de tarefas.",
		kind: "write",
		input: z.object(noteFields),
		handler: (args) => createNoteAction(args),
	}),

	defineTool({
		name: "update_note",
		title: "Editar anotação",
		description: "Atualiza uma anotação.",
		kind: "write",
		input: z.object({ id: uuid(), ...noteFields }),
		handler: async (args, { audit }) => {
			audit({ affectedIds: [args.id] });
			return updateNoteAction(args);
		},
	}),

	defineTool({
		name: "archive_note",
		title: "Arquivar anotação",
		description: "Arquiva ou desarquiva uma anotação.",
		kind: "write",
		input: z.object({ id: uuid(), archived: z.boolean() }),
		handler: async (args, { audit }) => {
			audit({ affectedIds: [args.id] });
			return archiveNoteAction(args);
		},
	}),

	defineTool({
		name: "delete_note",
		title: "Excluir anotação",
		description: "Exclui uma anotação.",
		kind: "destructive",
		input: z.object({ id: uuid() }),
		handler: async ({ id }, { audit }) => {
			audit({ affectedIds: [id] });
			return deleteNoteAction({ id });
		},
	}),
];
