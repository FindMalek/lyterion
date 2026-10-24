/**
 * What to add to an editable Navidrome playlist so it follows its Spotify playlist without undoing your edits: only
 * songs Lyterion never put there before and that aren't in it already. A song you removed stays removed.
 * `pushed` null = the playlist was just converted from its .m3u, which already holds everything: nothing to add.
 */
export function planPush(
	wanted: string[],
	current: string[],
	pushed: string[] | null,
): { add: string[]; pushed: string[] } {
	if (pushed === null)
		return { add: [], pushed: [...new Set([...wanted, ...current])] };
	const known = new Set([...pushed, ...current]);
	const add = [...new Set(wanted.filter((id) => !known.has(id)))];
	return { add, pushed: [...new Set([...pushed, ...add])] };
}
