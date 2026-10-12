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
	if (row.id === "spotify")
		return row.detail?.startsWith("app ok")
			? { status: "warn", label: "sign in" }
			: { status: "ok", label: "linked" };
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
	{ title: "Sources", ids: ["slskd", "proxy", "lidarr", "deezer", "youtube"] },
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

export function formatBytes(bytes: number | null | undefined): string {
	if (!bytes) return "";
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
	return `${Math.round(bytes / 1024 ** 2)}MB`;
}

export function formatQuality(file: {
	codec: string | null;
	bitrateKbps: number | null;
	bitDepth: number | null;
	sampleRateHz: number | null;
}): string {
	if (!file.codec) return "";
	if (/^(flac|alac|pcm_)/.test(file.codec))
		return `FLAC ${file.bitDepth ?? 16}${file.sampleRateHz ? `/${Math.round(file.sampleRateHz / 100) / 10}` : ""}`;
	return `${file.codec.toUpperCase()} ${file.bitrateKbps ?? "?"}`;
}

export function percent(value: number | null): string {
	return value == null ? "" : `${Math.round(value * 100)}%`;
}

// Recording lifecycle (docs/pipeline.md § Statuses) mapped to the one color rule.
export function recordingState(status: string): {
	status: Status;
	label: string;
} {
	if (status === "placed" || status === "linked" || status === "existing")
		return { status: "ok", label: status };
	if (status === "missing") return { status: "error", label: status };
	if (status === "review") return { status: "warn", label: status };
	if (status === "searching" || status === "fetching" || status === "verifying")
		return { status: "active", label: status };
	return { status: "idle", label: status };
}
