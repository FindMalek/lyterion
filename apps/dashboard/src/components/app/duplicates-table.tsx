"use client";

import {
	Badge,
	Button,
	Icons,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@lyterion/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { orpc } from "@/shared/api/orpc";

function mmss(ms: number) {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Group = NonNullable<ReturnType<typeof useDuplicates>["data"]>[number];

function useDuplicates() {
	return useQuery(orpc.library.duplicates.queryOptions());
}

// Fuzzy merges with a different isrc are the only ones worth a look.
function isUnconfirmed(group: Group) {
	const best = group.members.find((m) => m.trackId === m.preferred);
	return group.members.some(
		(m) =>
			m.edge === "fuzzy" &&
			m.trackId !== m.preferred &&
			(!m.isrc || !best?.isrc || m.isrc !== best.isrc),
	);
}

export function DuplicatesTable() {
	const { data: all } = useDuplicates();
	const [showAll, setShowAll] = useState(false);
	const data = showAll ? all : all?.filter(isUnconfirmed);
	const [done, setDone] = useState<Set<string>>(new Set());
	const [mergeFrom, setMergeFrom] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const override = useMutation({
		...orpc.library.override.mutationOptions(),
		onSuccess: (_r, vars) => {
			setDone((d) =>
				new Set(d).add(`${vars.kind}:${vars.trackA}:${vars.trackB}`),
			);
			toast.success(vars.kind === "merge" ? "Merge saved" : "Split saved", {
				description: "Applies on the next run.",
			});
		},
		onError: (err) => toast.error(err.message),
	});

	if (all && all.length === 0)
		return (
			<EmptyState
				icon={Icons.layers}
				title="No merged recordings"
				description="Every Spotify track is its own recording so far. Tracks that are the same song (a single and its album cut) appear here once a run groups them."
			/>
		);

	return (
		<Section
			title="Merged recordings"
			count={data?.length}
			description={
				mergeFrom ? (
					<span className="text-foreground">
						Merging <span className="font-medium">{mergeFrom.title}</span>: pick
						the recording to merge it into.
					</span>
				) : (
					"Stored once, not duplicated: Spotify tracks grouped into one file (D-006). By default only fuzzy merges without a shared ISRC show. Split out a different version, or merge two recordings of the same song. Changes apply on the next run."
				)
			}
			actions={
				<>
					{mergeFrom && (
						<Button
							size="xs"
							variant="ghost"
							onClick={() => setMergeFrom(null)}
						>
							Cancel merge
						</Button>
					)}
					<Button
						size="xs"
						variant="ghost"
						onClick={() => setShowAll((v) => !v)}
					>
						{showAll ? "Only worth a look" : `Show all ${all?.length ?? ""}`}
					</Button>
				</>
			}
		>
			{!data && (
				<div className="flex flex-col gap-2 p-3">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			)}
			{(data ?? []).map((group) => {
				const preferred = group.members[0]?.preferred;
				const isSource = mergeFrom?.id === preferred;
				return (
					<div key={group.recordingId} className="border-b last:border-b-0">
						<div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2">
							<span className="truncate font-medium text-xs">
								{group.title}
							</span>
							{preferred && (
								<Button
									size="xs"
									variant={mergeFrom && !isSource ? "default" : "ghost"}
									onClick={() => {
										if (!mergeFrom)
											return setMergeFrom({
												id: preferred,
												title: group.title,
											});
										if (!isSource)
											override.mutate({
												kind: "merge",
												trackA: mergeFrom.id,
												trackB: preferred,
											});
										setMergeFrom(null);
									}}
								>
									{isSource
										? "Cancel"
										: mergeFrom
											? "Merge into this"
											: "Merge…"}
								</Button>
							)}
						</div>
						<Table>
							<TableBody>
								{group.members.map((m) => {
									const key = `split:${m.trackId}:${m.preferred}`;
									return (
										<TableRow key={m.trackId}>
											<TableCell className="max-w-72 truncate">
												{m.title}
											</TableCell>
											<TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
												{m.album ?? ""}
											</TableCell>
											<TableCell className="w-14 font-mono text-muted-foreground tabular-nums">
												{mmss(m.durationMs)}
											</TableCell>
											<TableCell className="hidden w-36 font-mono text-muted-foreground lg:table-cell">
												{m.isrc ?? ""}
											</TableCell>
											<TableCell className="w-28">
												{m.trackId === m.preferred ? (
													<Badge
														variant="outline"
														className="font-mono font-normal"
													>
														preferred
													</Badge>
												) : (
													<span className="font-mono text-muted-foreground">
														via {m.edge}
													</span>
												)}
											</TableCell>
											<TableCell className="w-28 text-right">
												{m.trackId !== m.preferred &&
													(done.has(key) ? (
														<span className="font-mono text-success">
															splits next run
														</span>
													) : (
														<Button
															size="xs"
															variant="ghost"
															disabled={override.isPending}
															onClick={() =>
																override.mutate({
																	kind: "split",
																	trackA: m.trackId,
																	trackB: m.preferred,
																})
															}
														>
															Split out
														</Button>
													))}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				);
			})}
		</Section>
	);
}
