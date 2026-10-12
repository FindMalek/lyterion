"use client";

import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

export function PlaylistsTable() {
	const { data } = useQuery(orpc.library.playlists.queryOptions());
	if (data && data.length === 0)
		return (
			<p className="px-3 py-3 text-muted-foreground text-xs">
				No playlists yet. They appear after the first Spotify export.
			</p>
		);
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-xs">
				<thead>
					<tr className="border-b text-left text-muted-foreground">
						<th className="h-7 w-10 px-3 font-normal" />
						<th className="h-7 px-3 font-normal">playlist</th>
						<th className="h-7 px-3 text-right font-normal">entries</th>
						<th className="h-7 px-3 text-right font-normal">found</th>
						<th className="h-7 px-3 text-right font-normal">missing</th>
						<th className="h-7 px-3 font-normal">state</th>
						<th className="h-7 px-3 font-normal">written (utc)</th>
					</tr>
				</thead>
				<tbody>
					{(data ?? []).map((p) => {
						const missing = p.missing ?? null;
						const found = missing == null ? null : p.entries - missing;
						const state = p.unavailable
							? { status: "warn" as const, label: "items hidden in dev mode" }
							: p.writtenAt == null
								? { status: "idle" as const, label: "not written yet" }
								: missing
									? { status: "warn" as const, label: `${missing} missing` }
									: { status: "ok" as const, label: "complete" };
						return (
							<tr key={p.id} className="border-b hover:bg-muted/40">
								<td className="px-3 py-1">
									{p.imageUrl ? (
										// biome-ignore lint/performance/noImgElement: Spotify CDN thumbnails, next/image would need the remote host configured
										<img
											src={p.imageUrl}
											alt=""
											className="size-6 object-cover"
											loading="lazy"
										/>
									) : (
										<span className="block size-6 bg-muted" />
									)}
								</td>
								<td className="max-w-80 truncate px-3 py-1.5">{p.name}</td>
								<td className="px-3 py-1.5 text-right font-mono">
									{p.entries}
								</td>
								<td className="px-3 py-1.5 text-right font-mono">
									{found ?? ""}
								</td>
								<td className="px-3 py-1.5 text-right font-mono">
									{missing ? (
										<span className="text-warning">{missing}</span>
									) : (
										(missing ?? "")
									)}
								</td>
								<td className="px-3 py-1.5">
									<StatusLabel {...state} />
								</td>
								<td className="px-3 py-1.5 font-mono text-muted-foreground">
									{p.writtenAt ? formatDateTime(p.writtenAt) : ""}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
