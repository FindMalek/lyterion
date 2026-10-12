import { env } from "@lyterion/env/server";
import type { ConnectionsEnv } from "../health/connections";
import { parseCredentials, type RawCredentials } from "./form";
import type { CredentialKind } from "./kinds";
import { rawCredentials } from "./store";

// Connection checks read the same credentials the tasks will use; `override` tests unsaved form values.
export async function resolveConnectionsEnv(
	spotifyLinked: boolean,
	override?: { kind: CredentialKind; raw: RawCredentials },
): Promise<ConnectionsEnv> {
	async function load<K extends CredentialKind>(kind: K) {
		const raw =
			override?.kind === kind ? override.raw : (await rawCredentials(kind)).raw;
		return parseCredentials(kind, raw);
	}
	const [spotify, navidrome, slskd, proxy, deezer, acoustid, groq, jev, ntfy] =
		await Promise.all([
			load("spotify"),
			load("navidrome"),
			load("slskd"),
			load("proxy"),
			load("deezer"),
			load("acoustid"),
			load("groq"),
			load("jev"),
			load("ntfy"),
		]);
	return {
		spotifyLinked,
		spotifyApp: spotify ?? undefined,
		navidrome: navidrome ?? undefined,
		slskd: slskd ?? undefined,
		proxyBackends: proxy?.backends ?? [],
		deezerArl: deezer?.arl,
		ytdlpCookiesPath: env.LYTERION_YTDLP_COOKIES_PATH,
		acoustidKey: acoustid?.apiKey,
		groqKey: groq?.apiKey,
		jevKey: jev?.apiKey,
		ntfyUrl: ntfy?.url,
		triggerApiUrl: env.LYTERION_TRIGGER_API_URL,
	};
}
