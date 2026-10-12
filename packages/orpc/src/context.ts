import { auth } from "@lyterion/core";

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export type Context = {
	session: Session;
	headers: Headers;
};

export async function createContext(headers: Headers): Promise<Context> {
	const session = await auth.api.getSession({ headers });
	return { session, headers };
}
