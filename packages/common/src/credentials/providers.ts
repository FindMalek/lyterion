import { env } from "@lyterion/env/server";
import { pacer } from "../acquire/pace";
import { createProxyProvider } from "../providers/proxy";
import { createSlskdProvider, MIN_SEARCH_GAP_MS } from "../providers/slskd";
import type { Provider } from "../providers/types";
import { createYoutubeProvider } from "../providers/youtube";
import { getCredentials } from "./store";

const YOUTUBE_GAP_MS = 3_000;
const YOUTUBE_JITTER_MS = 4_000;

/** Providers with credentials set, built fresh per task run so a dashboard edit applies on the next run. */
export async function configuredProviders(): Promise<Provider[]> {
	const [slskd, proxy] = await Promise.all([
		getCredentials("slskd"),
		getCredentials("proxy"),
	]);
	const providers: Provider[] = [];
	if (proxy) providers.push(createProxyProvider({ backends: proxy.backends }));
	if (slskd)
		providers.push(
			createSlskdProvider({
				url: slskd.url,
				apiKey: slskd.apiKey,
				downloadsDir: env.LYTERION_SLSKD_DOWNLOADS_DIR,
				pace: pacer("slskd-search", MIN_SEARCH_GAP_MS),
			}),
		);
	// Opt-in through the cookies file: without cookies YouTube's bot checks fail most downloads.
	if (env.LYTERION_YTDLP_COOKIES_PATH)
		providers.push(
			createYoutubeProvider({
				cookiesPath: env.LYTERION_YTDLP_COOKIES_PATH,
				potProviderUrl: env.LYTERION_YTDLP_POT_PROVIDER_URL,
				binary: env.LYTERION_YTDLP_PATH,
				pace: pacer("youtube", YOUTUBE_GAP_MS, YOUTUBE_JITTER_MS),
			}),
		);
	return providers;
}
