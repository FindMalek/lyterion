// Stands in for the Spotify track id of a recording added by hand (the wishlist).
export const CUSTOM_TRACK_PREFIX = "custom-";

/** A wishlist track added from a YouTube or SoundCloud link keeps the link after this prefix. */
export const CUSTOM_LINK_PREFIX = `${CUSTOM_TRACK_PREFIX}link-`;

export function linkOf(preferredId: string): string | undefined {
	return preferredId.startsWith(CUSTOM_LINK_PREFIX)
		? preferredId.slice(CUSTOM_LINK_PREFIX.length)
		: undefined;
}

export const WISHLIST_RUN_KIND = "wishlist";
