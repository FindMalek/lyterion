"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
	Icons,
	Progress,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import {
	formatDateTime,
	formatDuration,
	orderedStages,
	type RunRow,
	runState,
	stageLabel,
} from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusBadge, StatusLabel } from "./status-dot";

type Stage = RunRow["stages"][string];

function pct(p: Stage) {
	return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
}

// A row per stage, in pipeline order: what's done, what's pending, and what failed.
function CurrentRun({ run }: { run: RunRow }) {
	const stages = orderedStages(run.stages as Record<string, Stage>);
	const errors = stages.filter(([, p]) => p.error);
	return (
		<Section
			title={`Run #${run.id}`}
			description={`started ${formatDateTime(run.startedAt)} utc · ${formatDuration(run.startedAt, run.finishedAt)}`}
			actions={<StatusBadge {...runState(run)} />}
		>
			<div className="divide-y">
				{stages.map(([stage, p]) => {
					const active = run.status === "running" && p.done < p.total;
					return (
						<div
							key={stage}
							className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)_13rem]"
						>
							<span className="flex items-center gap-2 font-mono">
								{active ? (
									<Icons.spinner className="size-3 animate-spin text-muted-foreground" />
								) : p.total > 0 && p.done >= p.total ? (
									<Icons.check className="size-3 text-success" />
								) : (
									<span className="size-3" />
								)}
								{stageLabel(stage)}
							</span>
							<Progress value={pct(p)} className="h-1.5" />
							<span className="whitespace-nowrap text-right font-mono text-muted-foreground tabular-nums">
								<span className="text-foreground">
									{p.done.toLocaleString()}
								</span>
								/{p.total.toLocaleString()}
								{p.failed > 0 && (
									<span className="text-warning">
										{" "}
										· {p.failed.toLocaleString()} failed
									</span>
								)}
							</span>
						</div>
					);
				})}
			</div>
			{errors.map(([stage, p]) => (
				<Alert
					key={stage}
					variant="destructive"
					className="border-x-0 border-b-0"
				>
					<Icons.alertCircle />
					<AlertTitle className="font-mono">
						{stageLabel(stage)} stopped
					</AlertTitle>
					<AlertDescription className="break-words font-mono">
						{p.error}
					</AlertDescription>
				</Alert>
			))}
		</Section>
	);
}

export function RunsTable() {
	const { data } = useQuery({
		...orpc.runs.list.queryOptions(),
		refetchInterval: 5_000,
		meta: { silent: true },
	});
	const sync = useQuery({
		...orpc.runs.syncState.queryOptions(),
		meta: { silent: true },
	});
	const latest = data?.[0];
	const history = data?.slice(latest?.status === "running" ? 1 : 0) ?? [];

	if (data && data.length === 0)
		return (
			<EmptyState
				icon={Icons.play}
				title="No run yet"
				description="Once Spotify and Navidrome are connected, a run exports your library, finds every track and places it in Navidrome. Start one from the top right."
			/>
		);

	return (
		<>
			{latest?.status === "running" && <CurrentRun run={latest} />}
			<Section
				title="Runs"
				count={data?.length}
				description={
					sync.data &&
					(sync.data.dailySync
						? `daily spotify sync on${sync.data.lastSync ? ` · last export ${formatDateTime(sync.data.lastSync)} utc` : " · the first run is a full export"}`
						: "daily spotify sync off since the final export")
				}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-14">#</TableHead>
							<TableHead className="w-40">Status</TableHead>
							<TableHead>Stages</TableHead>
							<TableHead className="hidden w-36 sm:table-cell">
								Started (utc)
							</TableHead>
							<TableHead className="w-20 text-right">Took</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{!data &&
							[0, 1, 2].map((i) => (
								<TableRow key={i}>
									<TableCell colSpan={5}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								</TableRow>
							))}
						{history.map((run) => (
							<TableRow key={run.id}>
								<TableCell className="font-mono text-muted-foreground">
									{run.id}
								</TableCell>
								<TableCell>
									<StatusLabel {...runState(run)} />
								</TableCell>
								<TableCell className="font-mono text-muted-foreground">
									<span className="flex flex-wrap gap-x-4">
										{orderedStages(run.stages).map(([stage, p]) => (
											<span key={stage} className="whitespace-nowrap">
												{stageLabel(stage)}{" "}
												<span className="text-foreground tabular-nums">
													{p.done}/{p.total}
												</span>
												{p.failed > 0 && (
													<span className="text-warning"> !{p.failed}</span>
												)}
											</span>
										))}
									</span>
									{orderedStages(run.stages)
										.filter(([, p]) => p.error)
										.map(([stage, p]) => (
											<p
												key={`${stage}-error`}
												className="mt-1 whitespace-normal break-words text-destructive"
											>
												{stageLabel(stage)}: {p.error}
											</p>
										))}
								</TableCell>
								<TableCell className="hidden font-mono sm:table-cell">
									{formatDateTime(run.startedAt)}
								</TableCell>
								<TableCell className="text-right font-mono text-muted-foreground">
									{formatDuration(run.startedAt, run.finishedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
		</>
	);
}
