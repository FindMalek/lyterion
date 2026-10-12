import type { GetToken } from "./client";

const API = "https://api.spotify.com/v1";

export type AuditRow = {
	name: string;
	path: string;
	status: number | null;
	ms: number | null;
	// What identifier the response carries: the whole point of S2 (#8).
	ids: string | null;
	note: string | null;
};

type Json = Record<string, unknown>;

function has(value: unknown, key: string): boolean {
	const ids = (value as { external_ids?: Json } | undefined)?.external_ids;
	return typeof ids?.[key] === "string" && (ids[key] as string).length > 0;
}

/** S2: hits every endpoint the export uses with the owner's real app and records status and identifiers. */
export async function auditSpotify(
	getToken: GetToken,
	doFetch: typeof fetch = fetch,
): Promise<AuditRow[]> {
	const rows: AuditRow[] = [];
	async function hit(
		name: string,
		path: string,
		read: (body: Json) => {
			ids?: string | null;
			note?: string | null;
		} = () => ({}),
	): Promise<Json | null> {
		const started = Date.now();
		try {
			const res = await doFetch(`${API}${path}`, {
				headers: { authorization: `Bearer ${await getToken(false)}` },
			});
			const body = (await res.json().catch(() => ({}))) as Json;
			const extra = res.ok ? read(body) : {};
			const error = (body.error as { message?: string } | undefined)?.message;
			rows.push({
				name,
				path,
				status: res.status,
				ms: Date.now() - started,
				ids: extra.ids ?? null,
				note: res.ok ? (extra.note ?? null) : (error ?? null),
			});
			return res.ok ? body : null;
		} catch (err) {
			rows.push({
				name,
				path,
				status: null,
				ms: Date.now() - started,
				ids: null,
				note: err instanceof Error ? err.message : String(err),
			});
			return null;
		}
	}
	const skip = (name: string, path: string, note: string) =>
		rows.push({ name, path, status: null, ms: null, ids: null, note });

	const me = await hit("profile", "/me", (b) => ({
		note: `product ${String(b.product ?? "unknown")}`,
	}));
	const meId = me?.id as string | undefined;

	const liked = await hit("liked songs", "/me/tracks?limit=1", (b) => {
		const track = (b.items as { track?: Json }[] | undefined)?.[0]?.track;
		return { ids: track ? (has(track, "isrc") ? "isrc" : "none") : null };
	});
	const trackId = (
		liked?.items as { track?: { id?: string } }[] | undefined
	)?.[0]?.track?.id;

	const albums = await hit("saved albums", "/me/albums?limit=1", (b) => {
		const album = (b.items as { album?: Json }[] | undefined)?.[0]?.album;
		const first = (album?.tracks as { items?: Json[] } | undefined)?.items?.[0];
		return {
			ids: album ? (has(album, "upc") ? "upc" : "none") : null,
			note: first
				? `album tracks ${has(first, "isrc") ? "carry" : "lack"} isrc`
				: null,
		};
	});
	const albumId = (
		albums?.items as { album?: { id?: string } }[] | undefined
	)?.[0]?.album?.id;

	await hit("followed artists", "/me/following?type=artist&limit=1");

	const playlists = await hit("playlists", "/me/playlists?limit=50");
	const list = (playlists?.items ?? []) as {
		id: string;
		owner?: { id?: string };
	}[];
	const owned = list.find((p) => p.owner?.id === meId);
	const followed = list.find((p) => p.owner?.id && p.owner.id !== meId);
	const items = (label: string, id: string | undefined) => {
		if (!id)
			return skip(
				label,
				"/playlists/{id}/items",
				"no such playlist in the library",
			);
		return hit(label, `/playlists/${id}/items?limit=1`, (b) => {
			const entry = (b.items as Json[] | undefined)?.[0];
			const track = (entry?.item ?? entry?.track) as Json | undefined;
			return {
				ids: track ? (has(track, "isrc") ? "isrc" : "none") : null,
				note:
					entry && "item" in entry
						? "items[].item"
						: entry
							? "items[].track"
							: null,
			};
		});
	};
	await items("owned playlist items", owned?.id);
	await items("followed playlist items", followed?.id);
	if (owned?.id) await hit("playlist cover", `/playlists/${owned.id}/images`);
	else skip("playlist cover", "/playlists/{id}/images", "no owned playlist");

	if (trackId) {
		await hit("track", `/tracks/${trackId}`, (b) => ({
			ids: has(b, "isrc") ? "isrc" : "none",
		}));
		await hit("tracks batch", `/tracks?ids=${trackId}`);
	} else {
		skip("track", "/tracks/{id}", "no liked song to try");
		skip("tracks batch", "/tracks?ids=", "no liked song to try");
	}
	if (albumId) {
		await hit("album", `/albums/${albumId}`, (b) => ({
			ids: has(b, "upc") ? "upc" : "none",
		}));
		await hit("albums batch", `/albums?ids=${albumId}`);
	} else {
		skip("album", "/albums/{id}", "no saved album to try");
		skip("albums batch", "/albums?ids=", "no saved album to try");
	}
	return rows;
}
