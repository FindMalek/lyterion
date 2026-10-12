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

const RUN_STATUS: Record<string, Status> = {
	running: "warn",
	done: "ok",
	failed: "error",
	cancelled: "idle",
};

export function RunsTable() {
	const { data } = useQuery({
		...orpc.runs.list.queryOptions(),
		refetchInterval: 5_000,
		meta: { silent: true },
	});

	return (
		<section>
			<div className="flex h-8 items-center border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">Runs</h2>
			</div>
			{data && data.length === 0 ? (
				<p className="px-3 py-2 font-mono text-muted-foreground text-xs">
					no runs yet
				</p>
			) : (
				<Table className="text-xs">
					<TableHeader>
						<TableRow>
							<TableHead className="h-7 px-3">#</TableHead>
							<TableHead className="h-7 px-3">status</TableHead>
							<TableHead className="h-7 px-3">stages</TableHead>
							<TableHead className="h-7 px-3">started</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{(data ?? []).map((run) => (
							<TableRow key={run.id}>
								<TableCell className="px-3 py-1.5 font-mono">
									{run.id}
								</TableCell>
								<TableCell className="px-3 py-1.5">
									<span className="inline-flex items-center gap-2">
										<StatusDot status={RUN_STATUS[run.status] ?? "idle"} />
										<span className="font-mono">{run.status}</span>
									</span>
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono text-muted-foreground">
									{Object.entries(run.stages)
										.map(
											([stage, p]) =>
												`${stage} ${p.done + p.failed}/${p.total}`,
										)
										.join("  ")}
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono">
									{new Date(run.startedAt)
										.toISOString()
										.slice(0, 16)
										.replace("T", " ")}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
