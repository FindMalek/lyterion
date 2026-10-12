import type { Status } from "@/components/app/status-dot";

export type ConnectionRow = {
	id: string;
	label: string;
	configured: boolean;
	ok: boolean | null;
	latencyMs: number | null;
	detail: string | null;
};

export type RunRow = {
	id: number;
	status: string;
	stages: Record<string, { total: number; done: number; failed: number }>;
	startedAt: Date | string;
	finishedAt: Date | string | null;
};

// Set but not probeable (an api key) counts as ready: green, not a warning.
export function connectionState(row: ConnectionRow): {
	status: Status;
	label: string;
} {
	if (!row.configured) return { status: "idle", label: "not set" };
	if (row.ok === false) return { status: "error", label: "down" };
	if (row.id === "spotify") return { status: "ok", label: "linked" };
	return { status: "ok", label: row.ok ? "connected" : "set" };
}

const STAGE_ORDER = [
	"export",
	"match",
	"acquire",
	"verify",
	"place",
	"scan",
	"playlists",
];

// Pipeline order, unknown stages last, so every run reads left to right the same way.
export function orderedStages<T>(stages: Record<string, T>): [string, T][] {
	const rank = (s: string) =>
		STAGE_ORDER.includes(s) ? STAGE_ORDER.indexOf(s) : STAGE_ORDER.length;
	return Object.entries(stages).sort(([a], [b]) => rank(a) - rank(b));
}

export function runFailures(run: RunRow): number {
	return Object.values(run.stages).reduce((n, s) => n + s.failed, 0);
}

export function runState(run: RunRow): { status: Status; label: string } {
	const failed = runFailures(run);
	switch (run.status) {
		case "running":
			return { status: "active", label: "running" };
		case "failed":
			return { status: "error", label: "failed" };
		case "cancelled":
			return { status: "idle", label: "cancelled" };
		case "done":
			return failed > 0
				? { status: "warn", label: `done, ${failed} failed` }
				: { status: "ok", label: "done" };
		default:
			return { status: "idle", label: run.status };
	}
}

export type ConnectionGroup = {
	title: string;
	ids: string[];
};

export const REQUIRED_CONNECTIONS = ["spotify", "navidrome"];

export const CONNECTION_GROUPS: ConnectionGroup[] = [
	{ title: "Required", ids: REQUIRED_CONNECTIONS },
	{ title: "Sources", ids: ["slskd", "proxy", "deezer", "youtube"] },
	{ title: "Matching", ids: ["acoustid", "groq", "jev"] },
	{ title: "System", ids: ["trigger", "ntfy"] },
];

export function formatDateTime(value: Date | string): string {
	return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

export function formatDuration(
	from: Date | string,
	to: Date | string | null,
): string {
	const ms =
		(to ? new Date(to) : new Date()).getTime() - new Date(from).getTime();
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
