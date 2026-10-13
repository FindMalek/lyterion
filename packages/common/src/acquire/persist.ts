import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@lyterion/db";
import {
	candidate,
	libraryFile,
	type RecordingStatus,
	recording,
	release,
	releaseTrack,
	reviewItem,
} from "@lyterion/db/schema/library";
import { spotifyTrack } from "@lyterion/db/schema/spotify";
import { and, eq, max, sql } from "drizzle-orm";

import {
	fetchLyrics,
	measureLoudness,
	replayGainTags,
	writeLyrics,
} from "../library/extras";
import { libraryRelativePath } from "../library/layout";
import { moveFile } from "../library/move";
import {
	downsampleToCap,
	type PlaceOptions,
	placeFile,
} from "../library/place";
import { buildTags } from "../library/tags";
import type { Candidate, RecordingTarget } from "../providers/types";
import type { AcquireOutcome, VerifiedOk } from "./acquire";
import { pacer } from "./pace";

// D-023 priorities: higher runs first in quality.upgrade.
const UPGRADE_PRIORITY: Record<string, number> = {
	below_transparent: 3,
	fake_lossless: 3,
	fake_bitrate: 3,
	unverified_match: 2,
	youtube_source: 1,
};

export type Placement = {
	releaseId: string | null;
	album: string;
	albumArtist: string;
	type: string | null;
	year: string | null;
	coverUrl: string | null;
	trackNumber: number;
	trackTotal: number;
	discNumber: number;
	discTotal: number;
};

export type AcquireJob = {
	target: RecordingTarget;
	placement: Placement;
	generation: number;
	status: RecordingStatus;
};

export async function loadAcquireJob(
	recordingId: string,
): Promise<AcquireJob | null> {
	const [rec] = await db
		.select()
		.from(recording)
		.where(eq(recording.id, recordingId))
		.limit(1);
	if (!rec) return null;
	const [track] = await db
		.select({ albumId: spotifyTrack.albumId })
		.from(spotifyTrack)
		.where(eq(spotifyTrack.id, rec.preferredSpotifyTrackId))
		.limit(1);
	const releaseId = rec.placedReleaseIds[0] ?? null;
	const [rel] = releaseId
		? await db.select().from(release).where(eq(release.id, releaseId)).limit(1)
		: [];
	const [slot] = releaseId
		? await db
				.select()
				.from(releaseTrack)
				.where(
					and(
						eq(releaseTrack.releaseId, releaseId),
						eq(releaseTrack.recordingId, rec.id),
					),
				)
				.limit(1)
		: [];
	const [discs] = releaseId
		? await db
				.select({ total: max(releaseTrack.discNumber) })
				.from(releaseTrack)
				.where(eq(releaseTrack.releaseId, releaseId))
		: [];
	const artist = rec.artists[0] ?? "Unknown Artist";
	return {
		target: {
			recordingId: rec.id,
			isrcs: rec.isrcs,
			title: rec.title,
			artists: rec.artists,
			album: rel?.title ?? null,
			durationMs: rec.durationMs,
			spotifyTrackId: rec.preferredSpotifyTrackId,
		},
		// No release (a playlist-only track): a single named after the song, like beets' singleton fallback.
		placement: {
			releaseId: rel?.id ?? null,
			album: rel?.title ?? rec.title,
			albumArtist: rel?.albumArtist ?? artist,
			type: rel?.type ?? (track?.albumId ? null : "single"),
			year: rel?.releaseDate?.slice(0, 4) ?? null,
			coverUrl: rel?.coverUrl ?? null,
			trackNumber: slot?.trackNumber ?? 1,
			trackTotal: rel?.totalTracks ?? 1,
			discNumber: slot?.discNumber ?? 1,
			discTotal: discs?.total ?? 1,
		},
		generation: rec.generation,
		status: rec.status,
	};
}

export async function setRecordingStatus(
	recordingId: string,
	status: RecordingStatus,
) {
	await db
		.update(recording)
		.set({ status, updatedAt: new Date() })
		.where(eq(recording.id, recordingId));
}

async function downloadCover(
	url: string,
	dest: string,
): Promise<string | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		await writeFile(dest, Buffer.from(await res.arrayBuffer()));
		return dest;
	} catch {
		return null;
	}
}

export function createPlacer(job: AcquireJob, options: PlaceOptions) {
	return async (
		staged: string,
		chosen: Candidate,
		verify: VerifiedOk,
	): Promise<string> => {
		await downsampleToCap(staged, verify.facts, options);
		const { target, placement } = job;
		const extension = path.extname(staged).slice(1) || chosen.format;
		const coverPath = placement.coverUrl
			? await downloadCover(placement.coverUrl, `${staged}.cover-src.jpg`)
			: null;
		const relativePath = libraryRelativePath({
			albumArtist: placement.albumArtist,
			artist: target.artists[0] ?? "Unknown Artist",
			album: placement.album,
			title: target.title,
			year: placement.year,
			trackNumber: placement.trackNumber,
			discNumber: placement.discNumber,
			discTotal: placement.discTotal,
			compilation: placement.type === "compilation",
			extension,
		});
		const tags = buildTags({
			title: target.title,
			artists: target.artists,
			album: placement.album,
			albumArtists: [placement.albumArtist],
			trackNumber: placement.trackNumber,
			trackTotal: placement.trackTotal,
			discNumber: placement.discNumber,
			discTotal: placement.discTotal,
			date: placement.year,
			originalDate: placement.year,
			releaseType: placement.type,
			compilation: placement.type === "compilation",
			isrc: target.isrcs[0] ?? null,
			barcode: null,
			genres: [],
			mbRecordingId: null,
			mbReleaseTrackId: null,
			mbReleaseId: null,
			mbReleaseGroupId: null,
			mbArtistIds: [],
			mbAlbumArtistIds: [],
			lyterionRecordingId: target.recordingId,
			spotifyTrackId: target.spotifyTrackId,
		});
		// Loudness and lyrics are extras: a failure here never blocks placing the file (#45).
		const [loudness, lyrics] = await Promise.all([
			measureLoudness(staged).catch(() => null),
			fetchLyrics(
				{
					artist: target.artists[0] ?? "",
					title: target.title,
					album: placement.album,
					durationMs: target.durationMs,
				},
				fetch,
				lrclibPace,
			).catch(() => null),
		]);
		const placed = await placeFile(
			{
				stagedPath: staged,
				relativePath,
				tags: {
					...tags,
					...(loudness ? replayGainTags(loudness) : {}),
					...(lyrics ? { LYRICS: [lyrics] } : {}),
				},
				coverPath,
			},
			options,
		);
		if (lyrics) await writeLyrics(placed, lyrics).catch(() => undefined);
		return placed;
	};
}

// One LRCLIB request a second across every worker, placement and backfill alike (D-050).
export const lrclibPace = pacer("lrclib", 1_000);

export async function recordOutcome(
	job: AcquireJob,
	outcome: Exclude<AcquireOutcome, { status: "paused" }>,
): Promise<void> {
	const recordingId = job.target.recordingId;
	await db.transaction(async (tx) => {
		const ids: number[] = [];
		for (const attempt of outcome.attempts) {
			const c = attempt.candidate;
			const [row] = await tx
				.insert(candidate)
				.values({
					recordingId,
					providerId: c.providerId,
					ref: c.ref,
					format: c.format,
					bitrateKbps: c.bitrateKbps,
					bitDepth: c.bitDepth,
					sampleRateHz: c.sampleRateHz,
					durationMs: c.durationMs,
					isrcMatch: c.isrcMatch,
					matchConfidence: c.matchConfidence,
					rank: attempt.rank,
					state: attempt.state,
					failureReason: attempt.failureReason,
					stagedPath: attempt.stagedPath,
				})
				.onConflictDoUpdate({
					target: [candidate.recordingId, candidate.providerId, candidate.ref],
					set: {
						rank: sql`excluded.rank`,
						state: sql`excluded.state`,
						failureReason: sql`excluded.failure_reason`,
						stagedPath: sql`coalesce(excluded.staged_path, ${candidate.stagedPath})`,
						matchConfidence: sql`excluded.match_confidence`,
					},
				})
				.returning({ id: candidate.id });
			if (row) ids.push(row.id);
		}

		if (outcome.status === "placed") {
			const { facts } = outcome.verify;
			const sizeBytes = await stat(outcome.path)
				.then((st) => st.size)
				.catch(() => null);
			await tx
				.insert(libraryFile)
				.values({
					recordingId,
					releaseId: job.placement.releaseId,
					path: outcome.path,
					owned: true,
					codec: facts.codec,
					bitrateKbps: facts.bitrateKbps,
					bitDepth: outcome.verify.effectiveBitDepth ?? facts.bitDepth,
					sampleRateHz: facts.sampleRateHz,
					durationMs: facts.durationMs,
					sizeBytes,
					spectralCutoffHz: Math.round(outcome.verify.cutoffHz),
					verifiedLossless: outcome.verify.verifiedLossless,
					sourceProvider: outcome.chosen.providerId,
					sourceRef: outcome.chosen.ref,
					upgradeReason: outcome.verify.upgradeReason,
					upgradePriority: outcome.verify.upgradeReason
						? (UPGRADE_PRIORITY[outcome.verify.upgradeReason] ?? 1)
						: null,
				})
				.onConflictDoUpdate({
					target: libraryFile.path,
					set: {
						recordingId: sql`excluded.recording_id`,
						codec: sql`excluded.codec`,
						bitrateKbps: sql`excluded.bitrate_kbps`,
						bitDepth: sql`excluded.bit_depth`,
						sampleRateHz: sql`excluded.sample_rate_hz`,
						durationMs: sql`excluded.duration_ms`,
						sizeBytes: sql`excluded.size_bytes`,
						spectralCutoffHz: sql`excluded.spectral_cutoff_hz`,
						verifiedLossless: sql`excluded.verified_lossless`,
						sourceProvider: sql`excluded.source_provider`,
						sourceRef: sql`excluded.source_ref`,
						upgradeReason: sql`excluded.upgrade_reason`,
						upgradePriority: sql`excluded.upgrade_priority`,
					},
				});
		}
		if (outcome.status === "review") {
			await tx.insert(reviewItem).values({
				recordingId,
				reason: "no candidate could be verified",
				candidateIds: ids,
			});
		}
		await tx
			.update(recording)
			.set({ status: outcome.status, updatedAt: new Date() })
			.where(eq(recording.id, recordingId));
	});
}

/** Recordings the acquire stage should work on: resolved, plus earlier misses so new providers get a go. */
export type AcquireTodo = {
	id: string;
	generation: number;
	releaseId: string | null;
};

export function reviewDir(stagingDir: string, recordingId: string): string {
	return path.join(stagingDir, "review", recordingId);
}

export async function moveToReview(
	stagingDir: string,
	recordingId: string,
	file: string,
): Promise<string> {
	const dir = reviewDir(stagingDir, recordingId);
	await mkdir(dir, { recursive: true });
	const dest = path.join(dir, path.basename(file));
	await moveFile(file, dest);
	return dest;
}
