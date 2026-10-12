import type { Fingerprint } from "./audio";

// AcoustID allows 3 requests/s.
const MIN_INTERVAL_MS = 340;
const MIN_SCORE = 0.5;

export type AcoustidResult = { score: number; recordingIds: string[] };
export type FingerprintVerdict = "match" | "mismatch" | "unknown";

export function createAcoustidClient(
	apiKey: string,
	doFetch: typeof fetch = fetch,
) {
	let lastRequestAt = 0;
	let queue: Promise<unknown> = Promise.resolve();

	async function lookup(fp: Fingerprint): Promise<AcoustidResult[]> {
		const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		lastRequestAt = Date.now();
		const res = await doFetch("https://api.acoustid.org/v2/lookup", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client: apiKey,
				meta: "recordings",
				duration: String(fp.durationSec),
				fingerprint: fp.fingerprint,
			}),
		});
		if (!res.ok) throw new Error(`acoustid ${res.status}`);
		const data = (await res.json()) as {
			status: string;
			results?: { score: number; recordings?: { id: string }[] }[];
		};
		if (data.status !== "ok") throw new Error(`acoustid status ${data.status}`);
		return (data.results ?? []).map((r) => ({
			score: r.score,
			recordingIds: (r.recordings ?? []).map((rec) => rec.id),
		}));
	}

	return {
		lookup(fp: Fingerprint): Promise<AcoustidResult[]> {
			const next = queue.then(() => lookup(fp));
			queue = next.catch(() => undefined);
			return next;
		},
	};
}

export function fingerprintVerdict(
	results: AcoustidResult[],
	expectedRecordingIds: string[],
): FingerprintVerdict {
	const confident = results.filter(
		(r) => r.score >= MIN_SCORE && r.recordingIds.length > 0,
	);
	if (confident.length === 0 || expectedRecordingIds.length === 0)
		return "unknown";
	const expected = new Set(expectedRecordingIds);
	return confident.some((r) => r.recordingIds.some((id) => expected.has(id)))
		? "match"
		: "mismatch";
}
