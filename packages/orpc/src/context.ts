import { getAuth, type Session } from "@lyterion/core";

export type { Session };

export type Context = {
	session: Session;
	headers: Headers;
};

export async function createContext(headers: Headers): Promise<Context> {
	const session = await (await getAuth()).api.getSession({ headers });
	return { session, headers };
}
