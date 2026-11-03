import { db } from "@lyterion/db";
import { librarySave, spotifyArtist } from "@lyterion/db/schema/spotify";
import { and, asc, eq, isNull } from "drizzle-orm";

export type FollowedArtist = {
	id: string;
	name: string;
	genres: string[];
	/** The artist table keeps no picture yet. */
	image: string | null;
};

/** The artists followed on Spotify right now (an unfollow in a later run drops them), and when the newest row was written. */
export async function followedArtists(): Promise<{
	artists: FollowedArtist[];
	syncedAt: string | null;
}> {
	const rows = await db
		.select({
			id: spotifyArtist.id,
			name: spotifyArtist.name,
			genres: spotifyArtist.genres,
			updatedAt: spotifyArtist.updatedAt,
		})
		.from(librarySave)
		.innerJoin(spotifyArtist, eq(spotifyArtist.id, librarySave.spotifyId))
		.where(
			and(
				eq(librarySave.kind, "followed_artist"),
				isNull(librarySave.removedAt),
			),
		)
		.orderBy(asc(spotifyArtist.name));
	const newest = rows.reduce<Date | null>(
		(latest, row) =>
			!latest || row.updatedAt > latest ? row.updatedAt : latest,
		null,
	);
	return {
		artists: rows.map(({ id, name, genres }) => ({
			id,
			name,
			genres,
			image: null,
		})),
		syncedAt: newest?.toISOString() ?? null,
	};
}
