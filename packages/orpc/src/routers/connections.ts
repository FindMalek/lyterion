import { checkConnections } from "@lyterion/common";
import { database } from "@lyterion/core";
import { account } from "@lyterion/db/schema/auth";
import { env } from "@lyterion/env/server";
import { and, eq } from "drizzle-orm";

import { protectedProcedure } from "../procedures";

export const connectionsRouter = {
	list: protectedProcedure.handler(async ({ context }) => {
		const [spotify] = await database
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, context.session.user.id),
					eq(account.providerId, "spotify"),
				),
			)
			.limit(1);
		return checkConnections({
			spotifyLinked: !!spotify,
			navidrome:
				env.LYTERION_NAVIDROME_URL &&
				env.LYTERION_NAVIDROME_USER &&
				env.LYTERION_NAVIDROME_PASSWORD
					? {
							url: env.LYTERION_NAVIDROME_URL,
							user: env.LYTERION_NAVIDROME_USER,
							password: env.LYTERION_NAVIDROME_PASSWORD,
						}
					: undefined,
			slskd:
				env.LYTERION_SLSKD_URL && env.LYTERION_SLSKD_API_KEY
					? { url: env.LYTERION_SLSKD_URL, apiKey: env.LYTERION_SLSKD_API_KEY }
					: undefined,
			proxyBackends: env.LYTERION_PROXY_BACKENDS,
			deezerArl: env.LYTERION_DEEZER_ARL,
			ytdlpCookiesPath: env.LYTERION_YTDLP_COOKIES_PATH,
			acoustidKey: env.LYTERION_ACOUSTID_API_KEY,
			groqKey: env.LYTERION_GROQ_API_KEY,
			jevKey: env.LYTERION_JEV_API_KEY,
			ntfyUrl: env.LYTERION_NTFY_URL,
			triggerApiUrl: env.LYTERION_TRIGGER_API_URL,
		});
	}),
};
