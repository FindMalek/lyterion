// D-026: Navidrome keeps this smart playlist current, Lyterion only reads it; "rating" field unverified on 0.64 (#44).
export const UPGRADE_QUEUE_NAME = "Upgrade queue";
export const UPGRADE_PLAYLIST_NAME = "⇪ Upgrade";

export function upgradeQueueNsp(): string {
	return `${JSON.stringify(
		{
			name: UPGRADE_QUEUE_NAME,
			comment:
				"Songs rated 1 star; Lyterion re-searches them and clears the rating once upgraded.",
			all: [{ is: { rating: 1 } }],
			sort: "title",
			order: "asc",
			limit: 1000,
		},
		null,
		2,
	)}\n`;
}
