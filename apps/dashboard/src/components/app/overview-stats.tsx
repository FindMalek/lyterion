"use client";

import { useQuery } from "@tanstack/react-query";
import { connectionState, runState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

function Tile({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<span className="font-mono text-[11px] text-muted-foreground">
				{label}
			</span>
			<span className="font-mono text-sm">{children}</span>
		</div>
	);
}

export function OverviewStats() {
	const connections = useQuery(orpc.connections.list.queryOptions());
	const runs = useQuery({
		...orpc.runs.list.queryOptions(),
		meta: { silent: true },
	});

	const rows = connections.data ?? [];
	const ready = rows.filter((r) => connectionState(r).status === "ok").length;
	const down = rows.filter((r) => connectionState(r).status === "error").length;
	const last = runs.data?.[0];

	return (
		<div className="grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-4 sm:divide-y-0">
			<Tile label="services ready">
				{connections.data ? `${ready}/${rows.length}` : "…"}
			</Tile>
			<Tile label="services down">
				<span className={down > 0 ? "text-destructive" : undefined}>
					{connections.data ? down : "…"}
				</span>
			</Tile>
			<Tile label="runs">{runs.data ? runs.data.length : "…"}</Tile>
			<Tile label="last run">
				{last ? (
					<StatusLabel {...runState(last)} />
				) : runs.data ? (
					"none yet"
				) : (
					"…"
				)}
			</Tile>
		</div>
	);
}
