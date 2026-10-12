// stars.sync (D-024, D-032): Spotify likes/saves/follows become Navidrome stars for the owner.
export type StarIds = {
	songs: Set<string>;
	albums: Set<string>;
	artists: Set<string>;
};

export type StarPlan = {
	star: { id: string[]; albumId: string[]; artistId: string[] };
	unstar: { id: string[]; albumId: string[]; artistId: string[] };
};

const KEYS = [
	["songs", "id"],
	["albums", "albumId"],
	["artists", "artistId"],
] as const;

/** Star what Spotify has and Navidrome lacks; unstar only what was removed on Spotify, never the owner's own stars. */
export function planStars(input: {
	wanted: StarIds;
	removed: StarIds;
	starred: StarIds;
}): StarPlan {
	const plan: StarPlan = {
		star: { id: [], albumId: [], artistId: [] },
		unstar: { id: [], albumId: [], artistId: [] },
	};
	for (const [set, param] of KEYS) {
		for (const id of input.wanted[set])
			if (!input.starred[set].has(id)) plan.star[param].push(id);
		for (const id of input.removed[set])
			if (input.starred[set].has(id) && !input.wanted[set].has(id))
				plan.unstar[param].push(id);
	}
	return plan;
}
