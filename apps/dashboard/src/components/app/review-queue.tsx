"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import {
	Alert,
	AlertDescription,
	AlertTitle,
	Badge,
	Button,
	cn,
	Icons,
	Kbd,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	AudioPlayer,
	type AudioPlayerHandle,
} from "@/components/shared/audio-player";
import { EmptyState } from "@/components/shared/empty-state";
import { env } from "@/lib/env";
import { orpc } from "@/shared/api/orpc";

type Item = Awaited<ReturnType<AppRouterClient["review"]["list"]>>[number];
type Candidate = Item["candidates"][number];

function mmss(ms: number | null | undefined) {
	if (ms == null) return "";
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function quality(c: Candidate) {
	if (c.bitDepth) return `${c.format.toUpperCase()} ${c.bitDepth}bit`;
	return `${c.format.toUpperCase()}${c.bitrateKbps ? ` ${c.bitrateKbps}` : ""}`;
}

// The original source in a new tab, or the Soulseek peer and path to the clipboard (Soulseek has no web page).
function SourceLink({ source }: { source: Candidate["source"] }) {
	if (source.url)
		return (
			<Button size="icon-xs" variant="ghost" asChild>
				<a
					href={source.url}
					target="_blank"
					rel="noreferrer"
					aria-label="Open the original source"
					title="Open the original source"
					onClick={(e) => e.stopPropagation()}
				>
					<Icons.externalLink />
				</a>
			</Button>
		);
	if (!source.copy) return null;
	const text = source.copy;
	return (
		<Button
			size="icon-xs"
			variant="ghost"
			aria-label="Copy peer and path"
			title="Copy peer and path"
			onClick={async (e) => {
				e.stopPropagation();
				try {
					await navigator.clipboard.writeText(text);
					toast.success("Copied peer and path");
				} catch {
					toast.error("Couldn't copy");
				}
			}}
		>
			<Icons.copy />
		</Button>
	);
}

function Meta({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
				{label}
			</dt>
			<dd className="truncate font-mono text-xs">{value || "·"}</dd>
		</div>
	);
}

function Match({ value }: { value: number }) {
	const pct = Math.round(value * 100);
	return (
		<span className="flex items-center justify-end gap-2">
			<span className="hidden h-1 w-12 bg-muted sm:block">
				<span
					className={cn(
						"block h-full",
						pct >= 85 ? "bg-foreground" : "bg-muted-foreground/60",
					)}
					style={{ width: `${pct}%` }}
				/>
			</span>
			<span className="w-9 text-right font-mono tabular-nums">{pct}%</span>
		</span>
	);
}

export function ReviewQueue() {
	const queryClient = useQueryClient();
	const { data } = useQuery(orpc.review.list.queryOptions());
	const [itemIndex, setItemIndex] = useState(0);
	const [candidateIndex, setCandidateIndex] = useState(0);
	const items = data ?? [];
	const item = items[Math.min(itemIndex, items.length - 1)];
	const candidates = item?.candidates ?? [];
	const selected = candidates[Math.min(candidateIndex, candidates.length - 1)];
	const player = useRef<AudioPlayerHandle>(null);

	// The resolved item drops out of the list, so the same index is already the next track.
	const settle = () => {
		setCandidateIndex(0);
		return Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.review.list.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.review.count.key() }),
		]);
	};
	const pick = useMutation({
		...orpc.review.pick.mutationOptions(),
		onSuccess: (_r, vars) => {
			// Gone from the list at once; the refetch confirms, and a failed placement brings it back with the reason.
			queryClient.setQueryData(orpc.review.list.queryKey(), (old) =>
				old?.filter((i) => i.id !== vars.reviewId),
			);
			toast.success("Picked", {
				description: `${item?.title}: placing it in the background.`,
			});
			return settle();
		},
		onError: (err) =>
			toast.error("Couldn't pick", { description: err.message }),
	});
	const skip = useMutation({
		...orpc.review.skip.mutationOptions(),
		onSuccess: () => {
			toast(`Skipped ${item?.title}`);
			return settle();
		},
		onError: (err) =>
			toast.error("Couldn't skip", { description: err.message }),
	});
	const busy = pick.isPending || skip.isPending;

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.metaKey ||
				e.ctrlKey ||
				e.altKey ||
				!item
			)
				return;
			// Space and Enter belong to a focused button, link or slider; the shortcuts only fire from the page itself.
			const onControl =
				e.target instanceof Element &&
				!!e.target.closest("button, a, [role=slider], [role=button]");
			if ((e.key === " " || e.key === "Enter") && onControl) return;
			if (e.key === "j" || e.key === "ArrowDown")
				setCandidateIndex((i) => Math.min(i + 1, candidates.length - 1));
			else if (e.key === "k" || e.key === "ArrowUp")
				setCandidateIndex((i) => Math.max(i - 1, 0));
			else if (e.key === "n") {
				setItemIndex((i) => Math.min(i + 1, items.length - 1));
				setCandidateIndex(0);
			} else if (e.key === "p") {
				setItemIndex((i) => Math.max(i - 1, 0));
				setCandidateIndex(0);
			} else if (e.key === "Enter" && selected && !busy)
				pick.mutate({ reviewId: item.id, candidateId: selected.id });
			else if (e.key === "s" && !busy) skip.mutate({ reviewId: item.id });
			else if (e.key === " ") player.current?.toggle();
			else return;
			e.preventDefault();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [item, items.length, candidates.length, selected, busy, pick, skip]);

	if (!data)
		return (
			<div className="grid md:grid-cols-[18rem_minmax(0,1fr)]">
				<div className="flex flex-col gap-2 border-r p-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-9 w-full" />
					))}
				</div>
				<div className="flex flex-col gap-3 p-3">
					<Skeleton className="h-6 w-1/2" />
					<Skeleton className="h-32 w-full" />
				</div>
			</div>
		);

	if (!item)
		return (
			<EmptyState
				icon={Icons.circleCheck}
				title="Nothing to review"
				description="Tracks land here when a file looked right but couldn't be proven: no fingerprint match and fuzzy metadata. Each one waits for you to pick a candidate or skip it."
			/>
		);

	return (
		<div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-1">
			<nav
				aria-label="tracks to review"
				className="max-h-56 overflow-y-auto border-b md:max-h-none md:border-r md:border-b-0"
			>
				<ol>
					{items.map((it, i) => (
						<li key={it.id}>
							<button
								type="button"
								onClick={() => {
									setItemIndex(i);
									setCandidateIndex(0);
								}}
								aria-current={it.id === item.id ? "true" : undefined}
								className={cn(
									"relative flex w-full flex-col items-start gap-0.5 border-b px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-muted/60",
									"aria-[current=true]:bg-muted aria-[current=true]:before:absolute aria-[current=true]:before:inset-y-0 aria-[current=true]:before:left-0 aria-[current=true]:before:w-0.5 aria-[current=true]:before:bg-foreground",
								)}
							>
								<span className="w-full truncate">{it.title}</span>
								<span className="flex w-full items-center gap-2 font-mono text-[11px] text-muted-foreground">
									<span className="min-w-0 flex-1 truncate">
										{it.artists.join(", ")}
									</span>
									{it.lastError && (
										<span className="shrink-0 text-destructive">failed</span>
									)}
									<span className="shrink-0 tabular-nums">
										{it.candidates.length}
									</span>
								</span>
							</button>
						</li>
					))}
				</ol>
			</nav>
			<section className="flex min-w-0 flex-col">
				<div className="flex flex-col gap-4 border-b px-4 py-4">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="min-w-0">
							<h2 className="truncate font-semibold text-lg tracking-tight">
								{item.title}
							</h2>
							<p className="truncate text-muted-foreground text-sm">
								{item.artists.join(", ")}
								{item.album && ` · ${item.album}`}
							</p>
						</div>
						<Badge
							variant="outline"
							className="border-warning/30 bg-warning/10 font-mono font-normal text-warning"
						>
							{item.reason}
						</Badge>
					</div>
					{item.lastError && (
						<Alert variant="destructive">
							<Icons.alertCircle />
							<AlertTitle>The last pick couldn't be placed</AlertTitle>
							<AlertDescription className="break-words font-mono">
								{item.lastError}
							</AlertDescription>
						</Alert>
					)}
					<dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
						<Meta label="Duration" value={mmss(item.durationMs)} />
						<Meta label="ISRC" value={item.isrcs.join(", ")} />
						<Meta label="Candidates" value={String(candidates.length)} />
						<Meta
							label="Position"
							value={`${Math.min(itemIndex, items.length - 1) + 1} of ${items.length}`}
						/>
					</dl>
				</div>
				<div className="min-h-0 flex-1 overflow-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8" />
								<TableHead className="w-20">Source</TableHead>
								<TableHead>File</TableHead>
								<TableHead className="w-8" />
								<TableHead className="hidden w-24 sm:table-cell">
									Quality
								</TableHead>
								<TableHead className="hidden w-24 text-right sm:table-cell">
									Length
								</TableHead>
								<TableHead className="w-24 text-right">Match</TableHead>
								<TableHead className="hidden lg:table-cell">Why not</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody role="radiogroup" aria-label="candidates">
							{candidates.map((c, i) => {
								const delta =
									c.durationMs == null
										? null
										: Math.round((c.durationMs - item.durationMs) / 1000);
								const isSelected = c.id === selected?.id;
								return (
									<TableRow
										key={c.id}
										role="radio"
										aria-checked={isSelected}
										tabIndex={-1}
										data-state={isSelected ? "selected" : undefined}
										onClick={() => setCandidateIndex(i)}
										className="cursor-pointer"
									>
										<TableCell>
											<span
												className={cn(
													"flex size-3 items-center justify-center border",
													isSelected
														? "border-foreground bg-foreground"
														: "border-muted-foreground/40",
												)}
											>
												{isSelected && (
													<Icons.check className="size-2.5 text-background" />
												)}
											</span>
										</TableCell>
										<TableCell className="font-mono">{c.providerId}</TableCell>
										<TableCell className="max-w-80 truncate font-mono text-muted-foreground">
											{c.label}
										</TableCell>
										<TableCell className="px-0">
											<SourceLink source={c.source} />
										</TableCell>
										<TableCell className="hidden font-mono sm:table-cell">
											{quality(c)}
										</TableCell>
										<TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
											{mmss(c.durationMs)}
											{delta != null && delta !== 0 && (
												<span
													className={
														Math.abs(delta) > 2
															? "text-warning"
															: "text-muted-foreground"
													}
												>
													{" "}
													{delta > 0 ? "+" : ""}
													{delta}s
												</span>
											)}
										</TableCell>
										<TableCell>
											<Match value={c.matchConfidence} />
										</TableCell>
										<TableCell className="hidden max-w-64 truncate font-mono text-muted-foreground lg:table-cell">
											{c.failureReason ?? ""}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				<div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center">
					{selected?.previewable ? (
						<AudioPlayer
							ref={player}
							src={`${env.NEXT_PUBLIC_LYTERION_API_URL}/api/review/audio/${selected.id}`}
							className="w-full sm:max-w-md"
						/>
					) : (
						<span className="flex h-9 items-center gap-2 font-mono text-[11px] text-muted-foreground">
							<Icons.volumeOff className="size-3.5" />
							no preview kept, picking it downloads it again
						</span>
					)}
					<div className="flex items-center gap-2 sm:ml-auto">
						<Button
							variant="outline"
							disabled={busy}
							isLoading={skip.isPending}
							onClick={() => skip.mutate({ reviewId: item.id })}
						>
							Skip track
							<Kbd>S</Kbd>
						</Button>
						<Button
							disabled={!selected || busy}
							isLoading={pick.isPending}
							onClick={() =>
								selected &&
								pick.mutate({ reviewId: item.id, candidateId: selected.id })
							}
						>
							Pick this file
							<Kbd className="bg-primary-foreground/15 text-primary-foreground">
								↵
							</Kbd>
						</Button>
					</div>
				</div>
				<p className="hidden gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground md:flex">
					<span>
						<Kbd>J</Kbd> <Kbd>K</Kbd> candidate
					</span>
					<span>
						<Kbd>N</Kbd> <Kbd>P</Kbd> track
					</span>
					<span>
						<Kbd>Space</Kbd> play
					</span>
				</p>
			</section>
		</div>
	);
}
