/** Limite em memória por janela fixa, no mesmo modelo das rotas de inbox. */
export function createRateLimiter(limit: number, windowMs: number) {
	const entries = new Map<string, { count: number; resetAt: number }>();

	return (key: string, now: number = Date.now()): boolean => {
		const entry = entries.get(key);

		if (!entry || entry.resetAt <= now) {
			entries.set(key, { count: 1, resetAt: now + windowMs });
			return true;
		}

		if (entry.count >= limit) {
			return false;
		}

		entry.count += 1;
		return true;
	};
}
