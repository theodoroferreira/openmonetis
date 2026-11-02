import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MCP_ROOT = join(import.meta.dirname, "..");

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) return listSources(path);

		return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
			? [path]
			: [];
	});
}

const serverSources = listSources(MCP_ROOT).filter(
	(path) => !path.includes("/components/"),
);

describe("fronteira do servidor MCP", () => {
	it.each([
		["ações de conta e tokens", "@/features/settings/actions"],
		["autenticação direta", "auth.api"],
		["criação em massa sem validações", "createMassTransactionsAction"],
	])("não alcança %s", (_label, forbidden) => {
		const offenders = serverSources.filter((path) =>
			readFileSync(path, "utf8").includes(forbidden),
		);

		expect(offenders).toEqual([]);
	});
});
