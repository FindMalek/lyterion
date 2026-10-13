"use client";

import { useQuery } from "@tanstack/react-query";

import { Stat, StatGrid } from "@/components/shared/stat";
import { connectionState, formatBytes } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

// The four numbers worth a glance: what's in Navidrome, what's missing, what waits on you, and whether every service is up.
export function OverviewStats() {
	const report = useQuery({
		...orpc.library.report.queryOptions(),
		refetchInterval: 30_000,
		meta: { silent: true },
	});
	const connections = useQuery(orpc.connections.list.queryOptions());
	const r = report.data;
	const inLibrary = r
		? (r.byStatus.placed ?? 0) +
			(r.byStatus.linked ?? 0) +
			(r.byStatus.existing ?? 0)
		: undefined;
	const total = r
		? Object.values(r.byStatus).reduce((a, b) => a + Number(b), 0)
		: 0;
	const missing = r ? (r.byStatus.missing ?? 0) : undefined;
	const review = r ? (r.byStatus.review ?? 0) : undefined;
	const rows = connections.data ?? [];
	const down = rows.filter((c) => connectionState(c).status === "error");
	const ready = rows.filter((c) => connectionState(c).status === "ok").length;

	return (
		<StatGrid>
			<Stat
				label="In library"
				value={inLibrary?.toLocaleString()}
				hint={
					r &&
					`of ${total.toLocaleString()} · ${formatBytes(r.bytes) || "0MB"} · ${r.byQuality.lossless.toLocaleString()} lossless`
				}
				href="/library"
			/>
			<Stat
				label="Missing"
				value={missing?.toLocaleString()}
				tone={missing ? "error" : undefined}
				hint="no source had a file that passed"
				href="/providers"
			/>
			<Stat
				label="To review"
				value={review?.toLocaleString()}
				tone={review ? "warn" : undefined}
				hint={review ? "pick or skip each one" : "nothing waiting"}
				href="/review"
			/>
			<Stat
				label="Services"
				value={connections.data ? `${ready}/${rows.length}` : undefined}
				tone={down.length ? "error" : undefined}
				hint={
					down.length
						? `down: ${down.map((c) => c.label).join(", ")}`
						: "all reachable"
				}
				href="/connections"
			/>
		</StatGrid>
	);
}
