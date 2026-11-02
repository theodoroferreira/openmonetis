"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import type { ActionResult } from "@/shared/lib/types/actions";
import { writeAuditEntry } from "./lib/audit";
import { undoInboxApproval } from "./lib/inbox-approval";

const undoApprovalSchema = z.object({
	id: z.string().uuid("Item inválido."),
});

/** Botão da aba Automação: desfaz pelo navegador uma aprovação do bot. */
export async function undoInboxApprovalAction(
	input: z.infer<typeof undoApprovalSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { id } = undoApprovalSchema.parse(input);

		const result = await undoInboxApproval(user.id, id);

		if (!result.success) {
			return result;
		}

		await writeAuditEntry({
			userId: user.id,
			tokenId: null,
			tool: "undo_inbox_approval",
			arguments: { id },
			result: "success",
			message: result.message,
			affectedIds: [id],
			snapshot: result.data?.snapshot,
		});

		revalidatePath("/settings");

		return { success: true, message: result.message };
	} catch (error) {
		return handleActionError(error);
	}
}
