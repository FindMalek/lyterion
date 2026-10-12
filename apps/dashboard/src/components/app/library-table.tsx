"use client";

import { cn, Input } from "@lyterion/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { formatBytes, formatQuality, recordingState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

const FILTERS = [
	"placed",
	"linked",
	"existing",
	"missing",
	"review",
	"resolved",
	"skipped",
] as const;
type Filter = (typeof FILTERS)[number];

export function LibraryTable() {
	const [status, setStatus] = useState<Filter | undefined>();
	const [search, setSearch] = useState("");
	const [offset, setOffset] = useState(0);
	const { data } = useQuery({
		...orpc.library.list.queryOptions({
			input: { status, search: search || undefined, offset },
		}),
		placeholderData: keepPreviousData,
	});
	const totals = data?.totals ?? {};

	return (
		<section>
			<div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
				<button
					type="button"
					onClick={() => {
						setStatus(undefined);
						setOffset(0);
					}}
					className={cn(
						"font-mono text-xs",
						!status
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					all {Object.values(totals).reduce((a, b) => a + Number(b), 0)}
				</button>
				{FILTERS.map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => {
							setStatus(f);
							setOffset(0);
						}}
						className={cn(
							"font-mono text-xs",
							status === f
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{f} {totals[f] ?? 0}
					</button>
				))}
				<Input
					value={search}
					onChange={(e) => {
						setSearch(e.target.value);
						setOffset(0);
					}}
					placeholder="search title or artist"
					className="ml-auto h-7 w-56 font-mono text-xs"
				/>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b text-left text-muted-foreground">
							<th className="h-7 px-3 font-normal">title</th>
							<th className="h-7 px-3 font-normal">artist</th>
							<th className="h-7 px-3 font-normal">status</th>
							<th className="h-7 px-3 font-normal">quality</th>
							<th className="h-7 px-3 font-normal">source</th>
							<th className="h-7 px-3 text-right font-normal">size</th>
							<th className="h-7 px-3 font-normal">flag</th>
						</tr>
					</thead>
					<tbody>
						{(data?.rows ?? []).map((row) => (
							<tr
								key={`${row.id}-${row.path ?? ""}`}
								className="border-b hover:bg-muted/40"
								title={row.path ?? undefined}
							>
								<td className="max-w-72 truncate px-3 py-1.5">{row.title}</td>
								<td className="max-w-56 truncate px-3 py-1.5 text-muted-foreground">
									{row.artists.join(", ")}
								</td>
								<td className="px-3 py-1.5">
									<StatusLabel {...recordingState(row.status)} />
								</td>
								<td className="px-3 py-1.5 font-mono">
									{formatQuality(row)}
									{row.verifiedLossless && (
										<span className="text-success"> ✓</span>
									)}
								</td>
								<td className="px-3 py-1.5 font-mono text-muted-foreground">
									{row.owned === false
										? "existing"
										: (row.sourceProvider ?? "")}
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
									{formatBytes(row.sizeBytes)}
								</td>
								<td className="px-3 py-1.5 font-mono text-warning">
									{row.upgradeReason ?? ""}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{data && data.rows.length === 0 && (
				<p className="px-3 py-3 text-muted-foreground text-xs">
					Nothing here yet. Recordings appear after a run resolves your Spotify
					library.
				</p>
			)}
			<div className="flex items-center justify-end gap-3 px-3 py-2 font-mono text-xs">
				<button
					type="button"
					disabled={offset === 0}
					onClick={() =>
						setOffset((o) => Math.max(0, o - (data?.pageSize ?? 100)))
					}
					className="text-muted-foreground hover:text-foreground disabled:opacity-40"
				>
					← prev
				</button>
				<span className="text-muted-foreground">
					{offset + 1}–{offset + (data?.rows.length ?? 0)}
				</span>
				<button
					type="button"
					disabled={(data?.rows.length ?? 0) < (data?.pageSize ?? 100)}
					onClick={() => setOffset((o) => o + (data?.pageSize ?? 100))}
					className="text-muted-foreground hover:text-foreground disabled:opacity-40"
				>
					next →
				</button>
			</div>
		</section>
	);
}
