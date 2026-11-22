import { env } from "@lyterion/env/server";

export type Fields = Record<string, string | number | boolean | undefined>;

const MAX_TEXT = 2000;

/** Addresses lose their query and fragment, and token-looking values go. */
export function scrub(text: string): string {
	return text
		.replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1")
		.replace(
			/\b(token|secret|password|auth|jwt|bearer|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
			"$1$2[redacted]",
		)
		.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
		.slice(0, MAX_TEXT);
}

type Target = {
	on: boolean;
	dsn?: string;
	o2?: { url: string; org: string; stream: string; auth: string };
	fetcher?: typeof fetch;
};

function parseDsn(dsn: string) {
	try {
		const url = new URL(dsn);
		const project = url.pathname.split("/").filter(Boolean).pop();
		if (!url.username || !project) return null;
		return {
			key: url.username,
			endpoint: `${url.origin}/api/${project}/store/`,
		};
	} catch {
		return null;
	}
}

/** Glitchtip gets the error, O2 gets a log line. Never throws: reporting must not fail a sync. */
export async function sendReport(
	target: Target,
	level: "error" | "warning",
	where: string,
	error: unknown,
	fields: Fields = {},
): Promise<void> {
	if (!target.on) return;
	const doFetch = target.fetcher ?? fetch;
	const failure = error instanceof Error ? error : new Error(String(error));
	const extra = Object.fromEntries(
		Object.entries(fields).map(([k, v]) => [
			k,
			typeof v === "string" ? scrub(v) : v,
		]),
	);
	const dsn = target.dsn ? parseDsn(target.dsn) : null;
	const jobs: Promise<unknown>[] = [];
	if (dsn)
		jobs.push(
			doFetch(dsn.endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=lyterion/1`,
				},
				body: JSON.stringify({
					event_id: crypto.randomUUID().replaceAll("-", ""),
					timestamp: Date.now() / 1000,
					platform: "node",
					level,
					tags: { where },
					extra,
					exception: {
						values: [{ type: failure.name, value: scrub(failure.message) }],
					},
					message: scrub(failure.stack ?? failure.message),
				}),
				signal: AbortSignal.timeout(5000),
			}),
		);
	if (target.o2)
		jobs.push(
			doFetch(
				`${target.o2.url}/api/${encodeURIComponent(target.o2.org)}/${encodeURIComponent(target.o2.stream)}/_json`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: target.o2.auth,
					},
					body: JSON.stringify([
						{
							_timestamp: Date.now() * 1000,
							level,
							where,
							message: scrub(failure.message),
							...extra,
						},
					]),
					signal: AbortSignal.timeout(5000),
				},
			),
		);
	await Promise.allSettled(jobs);
}

export function reportFailure(
	where: string,
	error: unknown,
	fields: Fields = {},
	level: "error" | "warning" = "error",
): Promise<void> {
	const user = env.LYTERION_O2_USER;
	const password = env.LYTERION_O2_PASSWORD;
	return sendReport(
		{
			on: env.LYTERION_DIAGNOSTICS === "on",
			dsn: env.LYTERION_GLITCHTIP_DSN,
			o2:
				env.LYTERION_O2_URL && user && password
					? {
							url: env.LYTERION_O2_URL.replace(/\/+$/, ""),
							org: env.LYTERION_O2_ORG,
							stream: env.LYTERION_O2_STREAM,
							auth: `Basic ${btoa(`${user}:${password}`)}`,
						}
					: undefined,
		},
		level,
		where,
		error,
		fields,
	);
}
