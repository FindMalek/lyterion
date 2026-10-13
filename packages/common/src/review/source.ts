import type { SlskdRef } from "../providers/slskd";

// What the owner sees for a candidate: the file name a peer shared, or the catalog id.
export function candidateLabel(providerId: string, ref: string): string {
	try {
		if (providerId === "slskd") {
			const parsed = JSON.parse(ref) as SlskdRef;
			return `${parsed.username}: ${parsed.filename.split(/[\\/]/).slice(-3).join("/")}`;
		}
		const parsed = JSON.parse(ref) as { id?: string; backend?: string };
		return parsed.id ? `${providerId} #${parsed.id}` : ref;
	} catch {
		return ref;
	}
}

/** Where the owner can check a candidate themselves: a web page when the source has one, else the text to copy (a Soulseek peer and path). */
export function candidateSource(
	providerId: string,
	ref: string,
): { url: string | null; copy: string | null } {
	try {
		if (providerId === "youtube")
			return {
				url: `https://music.youtube.com/watch?v=${encodeURIComponent(ref)}`,
				copy: null,
			};
		if (providerId === "slskd") {
			const parsed = JSON.parse(ref) as SlskdRef;
			return { url: null, copy: `${parsed.username} ${parsed.filename}` };
		}
		const parsed = JSON.parse(ref) as { id?: string };
		// Proxy backends serve Tidal track ids (providers/proxy.ts).
		if (providerId === "proxy" && parsed.id)
			return {
				url: `https://tidal.com/browse/track/${encodeURIComponent(parsed.id)}`,
				copy: null,
			};
		if (providerId === "deezer" && parsed.id)
			return {
				url: `https://www.deezer.com/track/${encodeURIComponent(parsed.id)}`,
				copy: null,
			};
	} catch {
		return { url: null, copy: ref };
	}
	return { url: null, copy: ref };
}
