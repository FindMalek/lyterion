import { createHash, randomBytes } from "node:crypto";

// Rows for the dashboard Connections screen (docs/ui.md).
const TIMEOUT_MS = 5_000;

export type ConnectionId =
	| "spotify"
	| "navidrome"
	| "slskd"
	| "proxy"
	| "deezer"
	| "youtube"
	| "acoustid"
	| "groq"
	| "jev"
	| "ntfy"
	| "trigger";

export type ConnectionStatus = {
	id: ConnectionId;
	label: string;
	configured: boolean;
	ok: boolean | null;
	latencyMs: number | null;
	detail: string | null;
};

export type ConnectionsEnv = {
	spotifyLinked: boolean;
	navidrome?: { url: string; user: string; password: string };
	slskd?: { url: string; apiKey: string };
	proxyBackends: string[];
	deezerArl?: string;
	ytdlpCookiesPath?: string;
	acoustidKey?: string;
	groqKey?: string;
	jevKey?: string;
	ntfyUrl?: string;
	triggerApiUrl?: string;
};

type Probe = () => Promise<{ ok: boolean; detail?: string }>;

async function timed(
	probe: Probe,
): Promise<Pick<ConnectionStatus, "ok" | "latencyMs" | "detail">> {
	const started = Date.now();
	try {
		const { ok, detail } = await probe();
		return { ok, latencyMs: Date.now() - started, detail: detail ?? null };
	} catch (err) {
		return {
			ok: false,
			latencyMs: Date.now() - started,
			detail: err instanceof Error ? err.message : String(err),
		};
	}
}

export function subsonicAuthParams(
	user: string,
	password: string,
	salt = randomBytes(6).toString("hex"),
) {
	const token = createHash("md5")
		.update(password + salt)
		.digest("hex");
	return new URLSearchParams({
		u: user,
		t: token,
		s: salt,
		v: "1.16.1",
		c: "lyterion",
		f: "json",
	});
}

export async function checkConnections(
	env: ConnectionsEnv,
	doFetch: typeof fetch = fetch,
): Promise<ConnectionStatus[]> {
	const get = (url: string, headers?: Record<string, string>) =>
		doFetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

	const rows: [ConnectionId, string, boolean, Probe | null][] = [
		["spotify", "Spotify", env.spotifyLinked, null],
		[
			"navidrome",
			"Navidrome",
			!!env.navidrome,
			env.navidrome
				? async () => {
						const { url, user, password } = env.navidrome as NonNullable<
							ConnectionsEnv["navidrome"]
						>;
						const res = await get(
							`${url.replace(/\/$/, "")}/rest/ping.view?${subsonicAuthParams(user, password)}`,
						);
						const body = (await res.json()) as {
							"subsonic-response"?: {
								status?: string;
								error?: { message?: string };
							};
						};
						const reply = body["subsonic-response"];
						return {
							ok: reply?.status === "ok",
							detail: reply?.error?.message,
						};
					}
				: null,
		],
		[
			"slskd",
			"Soulseek (slskd)",
			!!env.slskd,
			env.slskd
				? async () => {
						const { url, apiKey } = env.slskd as NonNullable<
							ConnectionsEnv["slskd"]
						>;
						const res = await get(
							`${url.replace(/\/$/, "")}/api/v0/application`,
							{ "X-API-Key": apiKey },
						);
						return {
							ok: res.ok,
							detail: res.ok ? undefined : `HTTP ${res.status}`,
						};
					}
				: null,
		],
		[
			"proxy",
			"Proxy backends",
			env.proxyBackends.length > 0,
			env.proxyBackends.length > 0
				? async () => {
						const results = await Promise.allSettled(
							env.proxyBackends.map((u) => get(u)),
						);
						const up = results.filter(
							(r) => r.status === "fulfilled" && r.value.status < 500,
						).length;
						return {
							ok: up > 0,
							detail: `${up}/${env.proxyBackends.length} up`,
						};
					}
				: null,
		],
		["deezer", "Deezer ARL", !!env.deezerArl, null],
		["youtube", "YouTube Music", !!env.ytdlpCookiesPath, null],
		["acoustid", "AcoustID", !!env.acoustidKey, null],
		["groq", "Groq", !!env.groqKey, null],
		["jev", "Jev", !!env.jevKey, null],
		[
			"ntfy",
			"ntfy",
			!!env.ntfyUrl,
			env.ntfyUrl
				? async () => {
						const res = await get(
							`${(env.ntfyUrl as string).replace(/\/$/, "")}/v1/health`,
						);
						return { ok: res.ok };
					}
				: null,
		],
		["trigger", "Trigger.dev", !!env.triggerApiUrl, null],
	];

	return Promise.all(
		rows.map(async ([id, label, configured, probe]) => {
			if (!configured || !probe)
				return {
					id,
					label,
					configured,
					ok: configured ? null : false,
					latencyMs: null,
					detail: null,
				};
			return { id, label, configured, ...(await timed(probe)) };
		}),
	);
}
