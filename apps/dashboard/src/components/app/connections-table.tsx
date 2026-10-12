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
import {
	CONNECTION_GROUPS,
	type ConnectionRow,
	connectionState,
} from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

export function ConnectionsTable() {
	const { data, isFetching, refetch } = useQuery(
		orpc.connections.list.queryOptions(),
	);
	const byId = new Map<string, ConnectionRow>(
		(data ?? []).map((row) => [row.id, row]),
	);

	return (
		<section>
			<div className="flex h-8 items-center justify-between border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					Services
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
						<TableHead className="h-7 w-48 px-3">service</TableHead>
						<TableHead className="h-7 w-36 px-3">status</TableHead>
						<TableHead className="h-7 w-20 px-3 text-right">latency</TableHead>
						<TableHead className="h-7 px-3">detail</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{CONNECTION_GROUPS.map((group) => (
						<GroupRows
							key={group.title}
							title={group.title}
							rows={group.ids.flatMap((id) => byId.get(id) ?? [])}
							loading={!data}
						/>
					))}
				</TableBody>
			</Table>
		</section>
	);
}

function GroupRows({
	title,
	rows,
	loading,
}: {
	title: string;
	rows: ConnectionRow[];
	loading: boolean;
}) {
	return (
		<>
			<TableRow className="hover:bg-transparent">
				<TableCell
					colSpan={4}
					className="bg-muted/40 px-3 py-1 font-mono text-[11px] text-muted-foreground"
				>
					{title.toLowerCase()}
				</TableCell>
			</TableRow>
			{loading && (
				<TableRow>
					<TableCell
						colSpan={4}
						className="px-3 py-1.5 font-mono text-muted-foreground"
					>
						checking…
					</TableCell>
				</TableRow>
			)}
			{rows.map((row) => (
				<TableRow key={row.id}>
					<TableCell className="px-3 py-1.5">{row.label}</TableCell>
					<TableCell className="px-3 py-1.5">
						<StatusLabel {...connectionState(row)} />
					</TableCell>
					<TableCell className="px-3 py-1.5 text-right font-mono text-muted-foreground">
						{row.latencyMs === null ? "" : `${row.latencyMs}ms`}
					</TableCell>
					<TableCell className="truncate px-3 py-1.5 font-mono text-muted-foreground">
						{row.detail ?? ""}
					</TableCell>
				</TableRow>
			))}
		</>
	);
}
