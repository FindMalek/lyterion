"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/shared/api/orpc";

function mmss(ms: number) {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function DuplicatesTable() {
	const { data } = useQuery(orpc.library.duplicates.queryOptions());
	const [done, setDone] = useState<Set<string>>(new Set());
	const [mergeFrom, setMergeFrom] = useState<string | null>(null);
	const override = useMutation({
		...orpc.library.override.mutationOptions(),
		onSuccess: (_r, vars) =>
			setDone((d) =>
				new Set(d).add(`${vars.kind}:${vars.trackA}:${vars.trackB}`),
			),
	});

	if (data && data.length === 0)
		return (
			<p className="px-3 py-3 text-muted-foreground text-xs">
				No merged recordings. Every Spotify track is its own recording so far.
			</p>
		);

	return (
		<section>
			<p className="border-b px-3 py-2 text-muted-foreground text-xs">
				Spotify tracks merged into one recording (one file, D-006). Split a
				track out if it's a different version, or merge two recordings that are
				the same song. Changes apply on the next run.
				{mergeFrom && (
					<span className="text-foreground">
						{" "}
						Pick the recording to merge into, or press merge again to cancel.
					</span>
				)}
			</p>
			{(data ?? []).map((group) => (
				<div key={group.recordingId} className="border-b">
					<div className="flex items-center justify-between bg-muted/40 px-3 py-1 text-xs">
						<span className="font-medium">{group.title}</span>
						<button
							type="button"
							className="font-mono text-muted-foreground hover:text-foreground"
							onClick={() => {
								const preferred = group.members[0]?.preferred;
								if (!preferred) return;
								if (!mergeFrom) return setMergeFrom(preferred);
								if (mergeFrom !== preferred)
									override.mutate({
										kind: "merge",
										trackA: mergeFrom,
										trackB: preferred,
									});
								setMergeFrom(null);
							}}
						>
							{mergeFrom === group.members[0]?.preferred
								? "cancel merge"
								: mergeFrom
									? "merge into this"
									: "merge…"}
						</button>
					</div>
					<table className="w-full text-xs">
						<tbody>
							{group.members.map((m) => {
								const key = `split:${[m.trackId, m.preferred].sort().join(":")}`;
								return (
									<tr key={m.trackId} className="border-t">
										<td className="max-w-72 truncate px-3 py-1.5">{m.title}</td>
										<td className="max-w-56 truncate px-3 py-1.5 text-muted-foreground">
											{m.album ?? ""}
										</td>
										<td className="px-3 py-1.5 font-mono text-muted-foreground">
											{mmss(m.durationMs)}
										</td>
										<td className="px-3 py-1.5 font-mono text-muted-foreground">
											{m.isrc ?? ""}
										</td>
										<td className="px-3 py-1.5 font-mono">
											{m.trackId === m.preferred
												? "preferred"
												: `via ${m.edge}`}
										</td>
										<td className="px-3 py-1.5 text-right">
											{m.trackId !== m.preferred &&
												(done.has(key) ? (
													<span className="font-mono text-success">
														split next run
													</span>
												) : (
													<button
														type="button"
														className="font-mono text-muted-foreground hover:text-foreground"
														onClick={() =>
															override.mutate({
																kind: "split",
																trackA: m.trackId,
																trackB: m.preferred,
															})
														}
													>
														split out
													</button>
												))}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			))}
		</section>
	);
}
