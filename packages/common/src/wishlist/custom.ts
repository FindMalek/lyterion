// Stands in for the Spotify track id of a recording added by hand (the wishlist).
export const CUSTOM_TRACK_PREFIX = "custom-";

/** A wishlist track added from a YouTube link keeps the video id after this prefix. */
export const CUSTOM_YOUTUBE_PREFIX = `${CUSTOM_TRACK_PREFIX}yt-`;

export function youtubeIdOf(preferredId: string): string | undefined {
	return preferredId.startsWith(CUSTOM_YOUTUBE_PREFIX)
		? preferredId.slice(CUSTOM_YOUTUBE_PREFIX.length)
		: undefined;
}

export const WISHLIST_RUN_KIND = "wishlist";
