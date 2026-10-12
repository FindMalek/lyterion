import { db } from "@lyterion/db";
import {
	candidate,
	libraryFile,
	playlistWrite,
	providerHealth,
	recording,
	recordingMember,
	recordingOverride,
} from "@lyterion/db/schema/library";
import {
	playlistEntry,
	spotifyAlbum,
	spotifyPlaylist,
	spotifyTrack,
} from "@lyterion/db/schema/spotify";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { LIKED_SONGS } from "../library/playlists-persist";
import { qualityRank } from "../upgrade/quality";

const PAGE = 100;

export async function libraryPage(input: {
	status?: string;
	search?: string;
	offset?: number;
}) {
	const where = and(
		input.status ? eq(recording.status, input.status as "placed") : undefined,
		input.search
			? sql`(${recording.title} ilike ${`%${input.search}%`} or array_to_string(${recording.artists}, ' ') ilike ${`%${input.search}%`})`
			: undefined,
	);
	const [rows, totals] = await Promise.all([
		db
			.select({
				id: recording.id,
				title: recording.title,
				artists: recording.artists,
				status: recording.status,
				durationMs: recording.durationMs,
				codec: libraryFile.codec,
				bitrateKbps: libraryFile.bitrateKbps,
				bitDepth: libraryFile.bitDepth,
				sampleRateHz: libraryFile.sampleRateHz,
				verifiedLossless: libraryFile.verifiedLossless,
				sourceProvider: libraryFile.sourceProvider,
				sizeBytes: libraryFile.sizeBytes,
				owned: libraryFile.owned,
				path: libraryFile.path,
				upgradeReason: libraryFile.upgradeReason,
			})
			.from(recording)
			.leftJoin(libraryFile, eq(libraryFile.recordingId, recording.id))
			.where(where)
			.orderBy(recording.title)
			.limit(PAGE)
			.offset(input.offset ?? 0),
		db
			.select({ status: recording.status, n: count() })
			.from(recording)
			.groupBy(recording.status),
	]);
	return {
		rows,
		totals: Object.fromEntries(totals.map((t) => [t.status, t.n])),
		pageSize: PAGE,
	};
}

export async function duplicateGroups() {
	const multi = db
		.select({ recordingId: recordingMember.recordingId })
		.from(recordingMember)
		.groupBy(recordingMember.recordingId)
		.having(sql`count(*) > 1`);
	const members = await db
		.select({
			recordingId: recordingMember.recordingId,
			trackId: recordingMember.spotifyTrackId,
			edge: recordingMember.edge,
			title: spotifyTrack.title,
			artists: spotifyTrack.artists,
			durationMs: spotifyTrack.durationMs,
			isrc: spotifyTrack.isrc,
			album: spotifyAlbum.title,
			preferred: recording.preferredSpotifyTrackId,
			recordingTitle: recording.title,
		})
		.from(recordingMember)
		.innerJoin(recording, eq(recording.id, recordingMember.recordingId))
		.innerJoin(
			spotifyTrack,
			eq(spotifyTrack.id, recordingMember.spotifyTrackId),
		)
		.leftJoin(spotifyAlbum, eq(spotifyAlbum.id, spotifyTrack.albumId))
		.where(inArray(recordingMember.recordingId, multi))
		.orderBy(recording.title, recordingMember.spotifyTrackId);
	const groups = new Map<
		string,
		{ recordingId: string; title: string; members: typeof members }
	>();
	for (const m of members) {
		const group = groups.get(m.recordingId) ?? {
			recordingId: m.recordingId,
			title: m.recordingTitle,
			members: [],
		};
		group.members.push(m);
		groups.set(m.recordingId, group);
	}
	return [...groups.values()];
}

export async function addOverride(
	kind: "merge" | "split",
	trackA: string,
	trackB: string,
) {
	const [a, b] = [trackA, trackB].sort() as [string, string];
	await db
		.insert(recordingOverride)
		.values({ kind, trackA: a, trackB: b })
		.onConflictDoNothing();
}

export async function playlistsOverview() {
	const [playlists, counts, writes] = await Promise.all([
		db.select().from(spotifyPlaylist).orderBy(spotifyPlaylist.name),
		db
			.select({
				playlistId: playlistEntry.playlistId,
				entries: count(),
				local: sql<number>`count(*) filter (where ${playlistEntry.spotifyTrackId} is null)`,
			})
			.from(playlistEntry)
			.groupBy(playlistEntry.playlistId),
		db.select().from(playlistWrite),
	]);
	const countOf = new Map(counts.map((c) => [c.playlistId, c]));
	const writeOf = new Map(writes.map((w) => [w.name, w]));
	const rows = playlists.map((p) => {
		const c = countOf.get(p.id);
		const w = writeOf.get(p.name);
		return {
			id: p.id,
			name: p.name,
			imageUrl: p.imageUrl,
			entries: c?.entries ?? 0,
			local: Number(c?.local ?? 0),
			missing: w?.missing ?? null,
			writtenAt: w?.writtenAt ?? null,
			unavailable: p.itemsUnavailable,
		};
	});
	const liked = writeOf.get(LIKED_SONGS);
	if (liked)
		rows.unshift({
			id: "liked",
			name: LIKED_SONGS,
			imageUrl: null,
			entries: liked.entries,
			local: 0,
			missing: liked.missing,
			writtenAt: liked.writtenAt,
			unavailable: false,
		});
	return rows;
}

export async function runReport() {
	const [byStatus, files, missing] = await Promise.all([
		db
			.select({ status: recording.status, n: count() })
			.from(recording)
			.groupBy(recording.status),
		db
			.select({
				provider: libraryFile.sourceProvider,
				owned: libraryFile.owned,
				codec: libraryFile.codec,
				bitrateKbps: libraryFile.bitrateKbps,
				verifiedLossless: libraryFile.verifiedLossless,
				upgradeReason: libraryFile.upgradeReason,
				sizeBytes: libraryFile.sizeBytes,
			})
			.from(libraryFile),
		db
			.select({
				id: recording.id,
				title: recording.title,
				artists: recording.artists,
			})
			.from(recording)
			.where(eq(recording.status, "missing"))
			.orderBy(recording.title)
			.limit(500),
	]);
	const byProvider: Record<string, number> = {};
	const byQuality = { lossless: 0, transparent: 0, below_transparent: 0 };
	let bytes = 0;
	for (const f of files) {
		const key = f.owned ? (f.provider ?? "unknown") : "existing";
		byProvider[key] = (byProvider[key] ?? 0) + 1;
		// Files Lyterion didn't place were never verified; class them by format instead of as unproven.
		const rank = f.owned
			? qualityRank(f)
			: qualityRank({ ...f, verifiedLossless: true });
		byQuality[
			rank === 3 ? "lossless" : rank === 2 ? "transparent" : "below_transparent"
		]++;
		bytes += f.sizeBytes ?? 0;
	}
	return {
		byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
		byProvider,
		byQuality,
		bytes,
		missing,
	};
}

export async function providerStats() {
	const since = new Date(Date.now() - 7 * 24 * 3600_000);
	const [attempts, health] = await Promise.all([
		db
			.select({
				provider: candidate.providerId,
				tried: sql<number>`count(*) filter (where ${candidate.state} <> 'new')`,
				chosen: sql<number>`count(*) filter (where ${candidate.state} = 'chosen')`,
				verifyFailed: sql<number>`count(*) filter (where ${candidate.failureReason} like 'verify:%')`,
				fetchFailed: sql<number>`count(*) filter (where ${candidate.failureReason} like 'fetch:%')`,
			})
			.from(candidate)
			.groupBy(candidate.providerId),
		db
			.select()
			.from(providerHealth)
			.where(gte(providerHealth.checkedAt, since))
			.orderBy(desc(providerHealth.checkedAt))
			.limit(2000),
	]);
	const history = new Map<string, typeof health>();
	for (const h of health)
		history.set(h.providerId, [...(history.get(h.providerId) ?? []), h]);
	const ids = new Set([...attempts.map((a) => a.provider), ...history.keys()]);
	return [...ids].sort().map((id) => {
		const a = attempts.find((x) => x.provider === id);
		const checks = history.get(id) ?? [];
		const tried = Number(a?.tried ?? 0);
		return {
			providerId: id,
			tried,
			chosen: Number(a?.chosen ?? 0),
			successRate: tried ? Number(a?.chosen ?? 0) / tried : null,
			verifyFailRate: tried ? Number(a?.verifyFailed ?? 0) / tried : null,
			fetchFailRate: tried ? Number(a?.fetchFailed ?? 0) / tried : null,
			uptime: checks.length
				? checks.filter((c) => c.ok).length / checks.length
				: null,
			last: checks[0] ?? null,
			// Newest last, at most 96 checks (a day at 15 minutes) for the strip.
			strip: checks
				.slice(0, 96)
				.reverse()
				.map((c) => c.ok),
		};
	});
}
