"use client";

import {
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
import { formatDateTime } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { type Status, StatusLabel } from "./status-dot";

export function PlaylistsTable() {
	const { data } = useQuery(orpc.library.playlists.queryOptions());

	if (data && data.length === 0)
		return (
			<EmptyState
				icon={Icons.playlist}
				title="No playlists yet"
				description="They appear after the first Spotify export, and are written into the library as .m3u8 files with their covers."
			/>
		);

	const complete = (data ?? []).filter(
		(p) => p.writtenAt && !p.missing && !p.unavailable,
	).length;

	return (
		<Section
			title="Playlists"
			count={data?.length}
			description={
				data && `${complete} complete · written as .m3u8 with sidecar covers`
			}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12" />
						<TableHead>Playlist</TableHead>
						<TableHead className="hidden w-48 sm:table-cell">Found</TableHead>
						<TableHead className="w-40">State</TableHead>
						<TableHead className="hidden w-36 lg:table-cell">
							Written (utc)
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{!data &&
						Array.from({ length: 6 }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows
							<TableRow key={i}>
								<TableCell colSpan={5}>
									<Skeleton className="h-7 w-full" />
								</TableCell>
							</TableRow>
						))}
					{(data ?? []).map((p) => {
						const missing = p.missing ?? null;
						const found = missing == null ? null : p.entries - missing;
						const state: { status: Status; label: string } = p.unavailable
							? { status: "warn", label: "hidden in dev mode" }
							: p.writtenAt == null
								? { status: "idle", label: "not written yet" }
								: missing
									? { status: "warn", label: `${missing} missing` }
									: { status: "ok", label: "complete" };
						return (
							<TableRow key={p.id}>
								<TableCell className="py-1">
									{p.imageUrl ? (
										// biome-ignore lint/performance/noImgElement: Spotify CDN thumbnails, next/image would need the remote host configured
										<img
											src={p.imageUrl}
											alt=""
											className="size-8 object-cover"
											loading="lazy"
										/>
									) : (
										<span className="flex size-8 items-center justify-center bg-muted">
											<Icons.playlist className="size-3.5 text-muted-foreground" />
										</span>
									)}
								</TableCell>
								<TableCell className="max-w-80">
									<div className="truncate">{p.name}</div>
									<div className="font-mono text-[11px] text-muted-foreground tabular-nums">
										{p.entries.toLocaleString()} tracks
									</div>
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									{found != null && p.entries > 0 ? (
										<div className="flex items-center gap-2">
											<Progress
												value={(found / p.entries) * 100}
												className="h-1 flex-1"
											/>
											<span className="w-16 text-right font-mono text-muted-foreground tabular-nums">
												{found}/{p.entries}
											</span>
										</div>
									) : (
										<span className="text-muted-foreground/50">·</span>
									)}
								</TableCell>
								<TableCell>
									<StatusLabel {...state} />
								</TableCell>
								<TableCell className="hidden font-mono text-muted-foreground lg:table-cell">
									{p.writtenAt ? formatDateTime(p.writtenAt) : ""}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</Section>
	);
}
