import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getActor } from "@/shared/lib/auth/actor";
import { auth } from "@/shared/lib/auth/config";

/**
 * Cached session fetch - deduplicates auth calls within a single request.
 * Layout + page calling getUser() will only hit auth once.
 */
const getSessionCached = cache(async () => {
	return auth.api.getSession({ headers: await headers() });
});

type Session = NonNullable<Awaited<ReturnType<typeof getSessionCached>>>;

/**
 * Único ponto de resolução de identidade: o ator, quando existe, vem antes da
 * sessão. Assim as Server Actions rodam igual para o navegador e para o MCP.
 *
 * Quem roda como ator só enxerga `id`, `name` e `email` do usuário.
 */
async function resolveSession(): Promise<Session | null> {
	const actor = getActor();

	if (actor) {
		return { user: actor.user } as unknown as Session;
	}

	return getSessionCached();
}

/**
 * Gets the current authenticated user
 * @returns User object
 * @throws Redirects to /login if user is not authenticated
 */
export async function getUser() {
	const session = await resolveSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session.user;
}

/**
 * Gets the current authenticated user ID
 * @returns User ID string
 * @throws Redirects to /login if user is not authenticated
 */
export async function getUserId() {
	const session = await resolveSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session.user.id;
}

/**
 * Gets the current authenticated session
 * @returns Full session object including user
 * @throws Redirects to /login if user is not authenticated
 */
export async function getUserSession() {
	const session = await resolveSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session;
}

/**
 * Gets the current session without requiring authentication
 * @returns Session object or null if not authenticated
 * @note This function does not redirect if user is not authenticated
 */
export async function getOptionalUserSession() {
	return resolveSession();
}
