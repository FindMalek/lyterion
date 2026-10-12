import { headers } from "next/headers";
import { z } from "zod";
import { serverApiUrl } from "@/lib/server-api-url";

const sessionSchema = z.object({
	user: z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		image: z.string().nullable().optional(),
	}),
	session: z.object({
		id: z.string(),
		userId: z.string(),
		expiresAt: z.coerce.date(),
		token: z.string(),
	}),
});

const apiResponseSchema = z.union([
	z.object({ data: sessionSchema }),
	sessionSchema,
	z.null(),
]);

export type Session = z.infer<typeof sessionSchema>;

export async function getSessionFromCookie(
	cookie: string | null,
): Promise<Session | null> {
	try {
		const res = await fetch(`${serverApiUrl()}/api/auth/get-session`, {
			headers: cookie ? { cookie } : undefined,
			credentials: "include",
			cache: "no-store",
		});

		if (!res.ok) {
			console.error(`[auth] get-session returned ${res.status}`);
			return null;
		}

		const parsed = apiResponseSchema.safeParse(await res.json());
		if (!parsed.success) {
			return null;
		}

		const data = parsed.data;
		if (data && "data" in data) {
			return data.data;
		}
		return data;
	} catch (error) {
		console.error(`[auth] get-session unreachable at ${serverApiUrl()}`, error);
		return null;
	}
}

export async function getServerSession(): Promise<Session | null> {
	const headersList = await headers();
	return getSessionFromCookie(headersList.get("cookie"));
}
