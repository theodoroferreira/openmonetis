import { describe, expect, it } from "vitest";
import { shiftIsoDate } from "./dates";

describe("shiftIsoDate", () => {
	it("retrocede um dia dentro do mesmo mes", () => {
		expect(shiftIsoDate("2026-09-11", -1)).toBe("2026-09-10");
	});

	it("retrocede atravessando a virada de mes", () => {
		expect(shiftIsoDate("2026-09-01", -1)).toBe("2026-08-31");
	});

	it("retrocede atravessando a virada de ano", () => {
		expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
	});

	it("lida com ano bissexto", () => {
		expect(shiftIsoDate("2028-03-01", -1)).toBe("2028-02-29");
	});

	it("avanca quando o offset e positivo", () => {
		expect(shiftIsoDate("2026-09-11", 2)).toBe("2026-09-13");
	});
});
