import { database, getAuth } from "@lyterion/core";
import { account, user } from "@lyterion/db/schema/auth";
import { and, eq } from "drizzle-orm";

import { createSpotifyClient, type GetToken } from "./client";

export async function ownerSpotifyAccount(): Promise<{
	userId: string;
	accountId: string;
}> {
	const [owner] = await database
		.select({ userId: user.id, accountId: account.id })
		.from(user)
		.innerJoin(
			account,
			and(eq(account.userId, user.id), eq(account.providerId, "spotify")),
		)
		.limit(1);
	if (!owner)
		throw new Error(
			"no owner with a linked Spotify account yet, sign in with Spotify first",
		);
	return owner;
}

export function ownerSpotifyClient(selection: {
	userId: string;
	accountId: string;
}) {
	return createSpotifyClient(ownerToken(selection));
}

/** The owner's Spotify access token through Better Auth, refreshed on demand. */
export function ownerToken(selection: {
	userId: string;
	accountId: string;
}): GetToken {
	return async (forceRefresh) => {
		const auth = await getAuth();
		const result = forceRefresh
			? await auth.api.refreshToken({ body: selection })
			: await auth.api.getAccessToken({ body: selection });
		if (!result.accessToken)
			throw new Error("spotify token unavailable, reconnect Spotify");
		return result.accessToken;
	};
}
