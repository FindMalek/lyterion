// Events and topics: D-031, server on the-keep (D-034).
const REVIEW_BATCH_MS = 60 * 60_000;

export type NotifyEvent =
	| { kind: "run_finished"; summary: string; failed: boolean }
	| { kind: "review_needed"; count: number }
	| {
			kind: "upgrade";
			artist: string;
			title: string;
			from: string;
			to: string | null;
	  }
	| { kind: "health"; subject: string; detail: string };

export type NtfyMessage = {
	title: string;
	message: string;
	tags: string[];
	priority: 1 | 2 | 3 | 4 | 5;
};

export function toMessage(event: NotifyEvent): NtfyMessage {
	switch (event.kind) {
		case "run_finished":
			return {
				title: event.failed
					? "Lyterion run finished with failures"
					: "Lyterion run finished",
				message: event.summary,
				tags: [event.failed ? "warning" : "white_check_mark"],
				priority: event.failed ? 4 : 3,
			};
		case "review_needed":
			return {
				title: "Lyterion needs review",
				message: `${event.count} track${event.count === 1 ? "" : "s"} need review`,
				tags: ["mag"],
				priority: 3,
			};
		case "upgrade":
			return event.to
				? {
						title: "Lyterion upgraded a track",
						message: `upgraded ${event.artist} – ${event.title}: ${event.from} → ${event.to}`,
						tags: ["arrow_up"],
						priority: 2,
					}
				: {
						title: "Lyterion: no better source yet",
						message: `${event.artist} – ${event.title} stays ${event.from}, retrying weekly`,
						tags: ["hourglass"],
						priority: 2,
					};
		case "health":
			return {
				title: `Lyterion: ${event.subject}`,
				message: event.detail,
				tags: ["rotating_light"],
				priority: 5,
			};
	}
}

export type NtfyConfig = { url: string; topic: string; token?: string };

export function createNotifier(
	config: NtfyConfig | null,
	doFetch: typeof fetch = fetch,
	now: () => number = Date.now,
) {
	let lastReviewAt = Number.NEGATIVE_INFINITY;
	let pendingReviews = 0;

	async function publish(message: NtfyMessage): Promise<void> {
		if (!config) return;
		const res = await doFetch(
			`${config.url.replace(/\/$/, "")}/${encodeURIComponent(config.topic)}`,
			{
				method: "POST",
				headers: {
					title: message.title,
					tags: message.tags.join(","),
					priority: String(message.priority),
					...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
				},
				body: message.message,
			},
		);
		if (!res.ok) throw new Error(`ntfy ${res.status}`);
	}

	return {
		async notify(event: NotifyEvent): Promise<boolean> {
			if (event.kind === "review_needed") {
				pendingReviews += event.count;
				if (now() - lastReviewAt < REVIEW_BATCH_MS) return false;
				lastReviewAt = now();
				const count = pendingReviews;
				pendingReviews = 0;
				await publish(toMessage({ kind: "review_needed", count }));
				return true;
			}
			await publish(toMessage(event));
			return true;
		},
	};
}
