import { env } from "@lyterion/env/server";

import { createProxyProvider } from "../providers/proxy";
import { createSlskdProvider } from "../providers/slskd";
import type { Provider } from "../providers/types";
import { getCredentials } from "./store";

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
			}),
		);
	return providers;
}
