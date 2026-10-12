"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import { Button, cn } from "@lyterion/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { env } from "@/lib/env";
import { orpc } from "@/shared/api/orpc";

type Item = Awaited<ReturnType<AppRouterClient["review"]["list"]>>[number];

function mmss(ms: number | null | undefined) {
	if (ms == null) return "";
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function quality(c: Item["candidates"][number]) {
	if (c.bitDepth) return `${c.format.toUpperCase()} ${c.bitDepth}bit`;
	return `${c.format.toUpperCase()}${c.bitrateKbps ? ` ${c.bitrateKbps}` : ""}`;
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

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.review.list.key() });
	const pick = useMutation({
		...orpc.review.pick.mutationOptions(),
		onSuccess: refresh,
	});
	const skip = useMutation({
		...orpc.review.skip.mutationOptions(),
		onSuccess: refresh,
	});
	const busy = pick.isPending || skip.isPending;

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.metaKey ||
				e.ctrlKey ||
				!item
			)
				return;
			if (e.key === "j")
				setCandidateIndex((i) => Math.min(i + 1, candidates.length - 1));
			else if (e.key === "k") setCandidateIndex((i) => Math.max(i - 1, 0));
			else if (e.key === "n") {
				setItemIndex((i) => Math.min(i + 1, items.length - 1));
				setCandidateIndex(0);
			} else if (e.key === "p") {
				setItemIndex((i) => Math.max(i - 1, 0));
				setCandidateIndex(0);
			} else if (e.key === "Enter" && selected && !busy)
				pick.mutate({ reviewId: item.id, candidateId: selected.id });
			else if (e.key === "s" && !busy) skip.mutate({ reviewId: item.id });
			else return;
			e.preventDefault();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [item, items.length, candidates.length, selected, busy, pick, skip]);

	if (data && items.length === 0)
		return (
			<p className="px-3 py-3 text-muted-foreground text-xs">
				Nothing to review. Tracks land here when a file looked right but
				couldn't be proven (no fingerprint match and fuzzy metadata).
			</p>
		);
	if (!item) return null;

	return (
		<div className="grid md:grid-cols-[16rem_minmax(0,1fr)] md:divide-x">
			<ol className="max-h-48 overflow-auto border-b md:max-h-none md:border-b-0">
				{items.map((it, i) => (
					<li key={it.id}>
						<button
							type="button"
							onClick={() => {
								setItemIndex(i);
								setCandidateIndex(0);
							}}
							aria-current={it.id === item.id ? "true" : undefined}
							className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-1.5 text-left text-xs hover:bg-muted aria-[current=true]:bg-muted"
						>
							<span className="truncate">{it.title}</span>
							<span className="truncate font-mono text-[11px] text-muted-foreground">
								{it.artists.join(", ")} · {it.candidates.length} candidates
							</span>
						</button>
					</li>
				))}
			</ol>
			<section className="min-w-0">
				<div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b px-3 py-2 text-xs sm:grid-cols-4">
					{[
						["title", item.title],
						["artist", item.artists.join(", ")],
						["album", item.album ?? ""],
						["duration", mmss(item.durationMs)],
						["isrc", item.isrcs.join(", ")],
						["reason", item.reason],
					].map(([label, value]) => (
						<div key={label} className="min-w-0">
							<div className="font-mono text-[11px] text-muted-foreground">
								{label}
							</div>
							<div className="truncate font-mono">{value || "·"}</div>
						</div>
					))}
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="border-b text-left text-muted-foreground">
								<th className="h-7 px-3 font-normal">source</th>
								<th className="h-7 px-3 font-normal">file</th>
								<th className="h-7 px-3 font-normal">quality</th>
								<th className="h-7 px-3 text-right font-normal">length</th>
								<th className="h-7 px-3 text-right font-normal">match</th>
								<th className="h-7 px-3 font-normal">why not</th>
							</tr>
						</thead>
						<tbody>
							{candidates.map((c, i) => {
								const delta =
									c.durationMs == null
										? null
										: Math.round((c.durationMs - item.durationMs) / 1000);
								return (
									<tr
										key={c.id}
										onClick={() => setCandidateIndex(i)}
										className={cn(
											"cursor-pointer border-b hover:bg-muted/60",
											c.id === selected?.id && "bg-muted",
										)}
									>
										<td className="px-3 py-1.5 font-mono">{c.providerId}</td>
										<td className="max-w-80 truncate px-3 py-1.5 font-mono text-muted-foreground">
											{c.label}
										</td>
										<td className="px-3 py-1.5 font-mono">{quality(c)}</td>
										<td className="px-3 py-1.5 text-right font-mono">
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
										</td>
										<td className="px-3 py-1.5 text-right font-mono">
											{Math.round(c.matchConfidence * 100)}%
										</td>
										<td className="px-3 py-1.5 font-mono text-muted-foreground">
											{c.failureReason ?? ""}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				<div className="flex flex-wrap items-center gap-3 px-3 py-2">
					{selected?.previewable ? (
						// biome-ignore lint/a11y/useMediaCaption: a music preview has no speech to caption
						<audio
							key={selected.id}
							controls
							preload="none"
							crossOrigin="use-credentials"
							src={`${env.NEXT_PUBLIC_LYTERION_API_URL}/api/review/audio/${selected.id}`}
							className="h-8 w-full max-w-md"
						/>
					) : (
						<span className="font-mono text-muted-foreground text-xs">
							no preview for this candidate, picking it downloads it again
						</span>
					)}
					<Button
						size="sm"
						disabled={!selected || busy}
						isLoading={pick.isPending}
						onClick={() =>
							selected &&
							pick.mutate({ reviewId: item.id, candidateId: selected.id })
						}
					>
						pick
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						isLoading={skip.isPending}
						onClick={() => skip.mutate({ reviewId: item.id })}
					>
						skip track
					</Button>
					<span className="font-mono text-[11px] text-muted-foreground">
						j/k candidate · enter pick · s skip · n/p track
					</span>
					{(pick.error ?? skip.error) && (
						<span className="font-mono text-destructive text-xs">
							{(pick.error ?? skip.error)?.message}
						</span>
					)}
					{pick.isSuccess && (
						<span className="font-mono text-success text-xs">
							queued, it lands after verification
						</span>
					)}
				</div>
			</section>
		</div>
	);
}
