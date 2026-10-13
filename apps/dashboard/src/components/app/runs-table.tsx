"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	formatDateTime,
	formatDuration,
	orderedStages,
	runState,
} from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

export function RunsTable() {
	const { data } = useQuery({
		...orpc.runs.list.queryOptions(),
		refetchInterval: 5_000,
		meta: { silent: true },
	});
	const queryClient = useQueryClient();
	const start = useMutation({
		...orpc.runs.start.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orpc.runs.list.key() }),
	});
	const running = data?.some((run) => run.status === "running") ?? false;
	const sync = useQuery({
		...orpc.runs.syncState.queryOptions(),
		meta: { silent: true },
	});
	const [confirmFinal, setConfirmFinal] = useState(false);
	const [confirmRestart, setConfirmRestart] = useState(false);

	return (
		<section>
			<div className="flex h-8 items-center justify-between gap-3 border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">Runs</h2>
				<div className="flex min-w-0 items-center gap-3">
					{start.error && (
						<span className="truncate font-mono text-destructive text-xs">
							{start.error.message}
						</span>
					)}
					{sync.data?.dailySync !== false && (
						<button
							type="button"
							disabled={running || start.isPending}
							onBlur={() => setConfirmFinal(false)}
							onClick={() => {
								if (!confirmFinal) return setConfirmFinal(true);
								setConfirmFinal(false);
								start.mutate({ mode: "final" });
							}}
							className="shrink-0 font-mono text-muted-foreground text-xs hover:text-foreground disabled:text-muted-foreground/50"
						>
							{confirmFinal
								? "click again: full export, then daily sync off"
								: "final export"}
						</button>
					)}
					<button
						type="button"
						disabled={start.isPending}
						onBlur={() => setConfirmRestart(false)}
						onClick={() => {
							// A new run stops the one going and cancels its queued tasks, so that takes a second click.
							if (running && !confirmRestart) return setConfirmRestart(true);
							setConfirmRestart(false);
							start.mutate({});
						}}
						className="shrink-0 font-mono text-xs hover:text-foreground disabled:text-muted-foreground/50"
					>
						{start.isPending
							? "starting…"
							: confirmRestart
								? "click again: stop the current run and start over"
								: running
									? "restart run →"
									: "start run →"}
					</button>
				</div>
			</div>
			{sync.data && (
				<p className="border-b px-3 py-1 font-mono text-[11px] text-muted-foreground">
					{sync.data.dailySync
						? `daily spotify sync on${sync.data.lastSync ? ` · last export ${formatDateTime(sync.data.lastSync)} utc` : " · first run will be a full export"}`
						: "daily spotify sync off since the final export"}
				</p>
			)}
			{data && data.length === 0 ? (
				<p className="px-3 py-3 text-muted-foreground text-xs">
					No migration has run yet. Once Spotify, Navidrome and Trigger.dev are
					connected, a run exports the library, finds every track and places it
					in Navidrome.
				</p>
			) : (
				<Table className="text-xs">
					<TableHeader>
						<TableRow>
							<TableHead className="h-7 w-12 px-3">#</TableHead>
							<TableHead className="h-7 w-36 px-3">status</TableHead>
							<TableHead className="h-7 px-3">stages</TableHead>
							<TableHead className="h-7 w-36 px-3">started (utc)</TableHead>
							<TableHead className="h-7 w-20 px-3 text-right">took</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{(data ?? []).map((run) => (
							<TableRow key={run.id}>
								<TableCell className="px-3 py-1.5 font-mono">
									{run.id}
								</TableCell>
								<TableCell className="px-3 py-1.5">
									<StatusLabel {...runState(run)} />
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono text-muted-foreground">
									{orderedStages(run.stages).map(([stage, p]) => (
										<span key={stage} className="mr-4 whitespace-nowrap">
											{stage}{" "}
											<span className="text-foreground">
												{p.done}/{p.total}
											</span>
											{p.failed > 0 && (
												<span className="text-warning"> !{p.failed}</span>
											)}
										</span>
									))}
									{orderedStages(run.stages)
										.filter(([, p]) => p.error)
										.map(([stage, p]) => (
											<p
												key={`${stage}-error`}
												className="mt-1 whitespace-normal break-words text-destructive"
											>
												{stage}: {p.error}
											</p>
										))}
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono">
									{formatDateTime(run.startedAt)}
								</TableCell>
								<TableCell className="px-3 py-1.5 text-right font-mono text-muted-foreground">
									{formatDuration(run.startedAt, run.finishedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
