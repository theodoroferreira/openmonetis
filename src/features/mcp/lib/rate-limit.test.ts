import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
	it("bloqueia ao passar do limite e libera na janela seguinte", () => {
		const check = createRateLimiter(2, 1000);

		expect(check("a", 0)).toBe(true);
		expect(check("a", 1)).toBe(true);
		expect(check("a", 2)).toBe(false);
		expect(check("a", 1001)).toBe(true);
	});

	it("isola as chaves", () => {
		const check = createRateLimiter(1, 1000);

		expect(check("a", 0)).toBe(true);
		expect(check("b", 0)).toBe(true);
	});
});
