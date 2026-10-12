"use client";

import { Button } from "@lyterion/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/shared/api/orpc";

function short(p: string) {
	const i = p.indexOf("/lyterion/");
	return i >= 0 ? p.slice(i + "/lyterion/".length) : p;
}

export function ReconcilePlan() {
	const { data } = useQuery(orpc.library.reconcilePlan.queryOptions());
	const [confirmRemove, setConfirmRemove] = useState(false);
	const reconcile = useMutation(orpc.library.reconcile.mutationOptions());
	if (!data) return null;
	const nothing = data.moves.length === 0 && data.removals.length === 0;

	return (
		<section>
			<div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
				<span className="text-muted-foreground">
					Dry run. Moves follow placement changes (a newly saved album, a
					merge). Removals are Lyterion-owned files nothing on Spotify points at
					anymore. Files outside lyterion/ are never touched.
				</span>
				<div className="ml-auto flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={nothing || reconcile.isPending}
						onClick={() => reconcile.mutate({ remove: false })}
					>
						apply {data.moves.length} moves
					</Button>
					<Button
						size="sm"
						variant="destructive"
						disabled={data.removals.length === 0 || reconcile.isPending}
						onBlur={() => setConfirmRemove(false)}
						onClick={() => {
							if (!confirmRemove) return setConfirmRemove(true);
							setConfirmRemove(false);
							reconcile.mutate({ remove: true });
						}}
					>
						{confirmRemove
							? `click again: delete ${data.removals.length} files`
							: `moves + remove ${data.removals.length}`}
					</Button>
				</div>
				{reconcile.error && (
					<span className="w-full font-mono text-destructive">
						{reconcile.error.message}
					</span>
				)}
				{reconcile.isSuccess && (
					<span className="w-full font-mono text-success">
						queued, playlists and Navidrome follow when it's done
					</span>
				)}
			</div>
			{nothing && (
				<p className="px-3 py-3 text-muted-foreground text-xs">
					Nothing to reconcile, every file sits where its placement says.
				</p>
			)}
			{data.moves.length > 0 && (
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b text-left text-muted-foreground">
							<th className="h-7 px-3 font-normal">move</th>
							<th className="h-7 px-3 font-normal">from</th>
							<th className="h-7 px-3 font-normal">to</th>
						</tr>
					</thead>
					<tbody>
						{data.moves.map((m) => (
							<tr key={m.fileId} className="border-b">
								<td className="px-3 py-1.5">{m.title}</td>
								<td className="max-w-96 truncate px-3 py-1.5 font-mono text-muted-foreground">
									{short(m.from)}
								</td>
								<td className="max-w-96 truncate px-3 py-1.5 font-mono">
									{short(m.to)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{data.removals.length > 0 && (
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b text-left text-muted-foreground">
							<th className="h-7 px-3 font-normal">unreferenced</th>
							<th className="h-7 px-3 font-normal">file</th>
						</tr>
					</thead>
					<tbody>
						{data.removals.map((r) => (
							<tr key={r.fileId} className="border-b">
								<td className="px-3 py-1.5">{r.title ?? "(recording gone)"}</td>
								<td className="max-w-[40rem] truncate px-3 py-1.5 font-mono text-warning">
									{short(r.path)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}
