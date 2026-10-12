"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/shared/api/orpc";

import { type Status, StatusDot } from "./status-dot";

function statusOf(row: { configured: boolean; ok: boolean | null }): {
	status: Status;
	label: string;
} {
	if (!row.configured) return { status: "idle", label: "not configured" };
	if (row.ok === null) return { status: "warn", label: "configured" };
	return row.ok
		? { status: "ok", label: "ok" }
		: { status: "error", label: "down" };
}

export function ConnectionsTable() {
	const { data, isFetching, refetch } = useQuery(
		orpc.connections.list.queryOptions(),
	);

	return (
		<section>
			<div className="flex h-8 items-center justify-between border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					Connections
				</h2>
				<button
					type="button"
					className="font-mono text-muted-foreground text-xs hover:text-foreground"
					onClick={() => refetch()}
				>
					{isFetching ? "checking…" : "recheck"}
				</button>
			</div>
			<Table className="text-xs">
				<TableHeader>
					<TableRow>
						<TableHead className="h-7 px-3">service</TableHead>
						<TableHead className="h-7 px-3">status</TableHead>
						<TableHead className="h-7 px-3 text-right">latency</TableHead>
						<TableHead className="h-7 px-3">detail</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{(data ?? []).map((row) => {
						const { status, label } = statusOf(row);
						return (
							<TableRow key={row.id}>
								<TableCell className="px-3 py-1.5">{row.label}</TableCell>
								<TableCell className="px-3 py-1.5">
									<span className="inline-flex items-center gap-2">
										<StatusDot status={status} />
										<span className="font-mono">{label}</span>
									</span>
								</TableCell>
								<TableCell className="px-3 py-1.5 text-right font-mono">
									{row.latencyMs === null ? "·" : `${row.latencyMs}ms`}
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono text-muted-foreground">
									{row.detail ?? ""}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</section>
	);
}
