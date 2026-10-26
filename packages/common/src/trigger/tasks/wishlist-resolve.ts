import { env } from "@lyterion/env/server";
import { task } from "@trigger.dev/sdk";

import { resolveWish, type WishMeta } from "../../wishlist/resolve";

// The api image has no yt-dlp, python, cookies or PO-token server; the task image has all of them.
export const wishlistResolveTask = task({
	id: "wishlist.resolve",
	maxDuration: 60,
	retry: { maxAttempts: 1 },
	run: (payload: { input: string }): Promise<WishMeta> =>
		resolveWish(payload.input, {
			youtubeOptions: {
				cookiesPath: env.LYTERION_YTDLP_COOKIES_PATH,
				potProviderUrl: env.LYTERION_YTDLP_POT_PROVIDER_URL,
				binary: env.LYTERION_YTDLP_PATH,
			},
		}),
});
