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
	spotifyApp?: { clientId: string; clientSecret: string };
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

// A client credentials token proves the id and secret pair without a user; sign-in needs the allowlist too.
export async function testSpotifyApp(
	app: { clientId: string; clientSecret: string },
	doFetch: typeof fetch = fetch,
): Promise<{ ok: boolean; detail?: string }> {
	const res = await doFetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	}).catch((err: unknown) => err as Error);
	if (res instanceof Error)
		return {
			ok: false,
			detail: `accounts.spotify.com unreachable: ${res.cause instanceof Error ? res.cause.message : res.message}`,
		};
	if (res.ok) return { ok: true };
	const body = (await res.json().catch(() => ({}))) as {
		error?: string;
		error_description?: string;
	};
	return {
		ok: false,
		detail:
			body.error === "invalid_client"
				? "spotify rejected the client id or secret"
				: `HTTP ${res.status} ${body.error_description ?? body.error ?? ""}`.trim(),
	};
}

export async function checkConnections(
	env: ConnectionsEnv,
	doFetch: typeof fetch = fetch,
): Promise<ConnectionStatus[]> {
	const get = (url: string, headers?: Record<string, string>) =>
		doFetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

	const rows: [ConnectionId, string, boolean, Probe | null][] = [
		[
			"spotify",
			"Spotify",
			env.spotifyLinked || !!env.spotifyApp,
			env.spotifyApp
				? async () => {
						const app = await testSpotifyApp(
							env.spotifyApp as NonNullable<ConnectionsEnv["spotifyApp"]>,
							doFetch,
						);
						if (!app.ok) return app;
						return {
							ok: true,
							detail: env.spotifyLinked
								? "signed in"
								: "app ok, sign in with spotify",
						};
					}
				: null,
		],
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
								type?: string;
								version?: string;
								serverVersion?: string;
								error?: { message?: string };
							};
						};
						const reply = body["subsonic-response"];
						const version = reply?.serverVersion ?? reply?.version;
						return {
							ok: reply?.status === "ok",
							detail:
								reply?.error?.message ??
								(version
									? `${reply?.type ?? "subsonic"} ${version}`
									: undefined),
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
		[
			"groq",
			"Groq",
			!!env.groqKey,
			env.groqKey
				? async () => {
						const res = await get("https://api.groq.com/openai/v1/models", {
							Authorization: `Bearer ${env.groqKey}`,
						});
						return {
							ok: res.ok,
							detail: res.ok ? undefined : `HTTP ${res.status}`,
						};
					}
				: null,
		],
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
