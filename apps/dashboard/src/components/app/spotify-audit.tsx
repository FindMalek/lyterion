"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import {
	Button,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/shared/api/orpc";

import { type Status, StatusLabel } from "./status-dot";

type Row = Awaited<
	ReturnType<AppRouterClient["connections"]["spotifyAudit"]>
>[number];

function rowState(row: Row): { status: Status; label: string } {
	if (row.status === null)
		return row.ms === null
			? { status: "idle", label: "skipped" }
			: { status: "error", label: "failed" };
	if (row.status >= 200 && row.status < 300)
		return row.ids === "none"
			? { status: "warn", label: `${row.status} no ids` }
			: { status: "ok", label: String(row.status) };
	return { status: "error", label: String(row.status) };
}

// S2 (#8): which endpoints the owner's dev-mode app may still call, and whether they carry ISRC/UPC.
export function SpotifyAudit() {
	const audit = useMutation(orpc.connections.spotifyAudit.mutationOptions());

	return (
		<section className="border-t">
			<div className="flex h-8 items-center justify-between border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					Spotify endpoint audit
				</h2>
				<Button
					size="sm"
					variant="outline"
					className="h-6 text-xs"
					isLoading={audit.isPending}
					onClick={() => audit.mutate({})}
				>
					run
				</Button>
			</div>
			{!audit.data && !audit.error && (
				<p className="px-3 py-2 text-muted-foreground text-xs">
					Calls every endpoint the export uses once, with your app and token,
					and shows which ones dev mode still allows and whether tracks carry an
					ISRC.
				</p>
			)}
			{audit.error && (
				<p className="px-3 py-2 font-mono text-destructive text-xs">
					{audit.error.message}
				</p>
			)}
			{audit.data && (
				<Table className="text-xs">
					<TableHeader>
						<TableRow>
							<TableHead className="h-7 w-44 px-3">endpoint</TableHead>
							<TableHead className="h-7 w-32 px-3">result</TableHead>
							<TableHead className="h-7 w-16 px-3">ids</TableHead>
							<TableHead className="h-7 w-16 px-3 text-right">ms</TableHead>
							<TableHead className="h-7 px-3">detail</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{audit.data.map((row) => (
							<TableRow key={row.name}>
								<TableCell className="px-3 py-1.5">
									<div>{row.name}</div>
									<div className="font-mono text-[11px] text-muted-foreground">
										{row.path}
									</div>
								</TableCell>
								<TableCell className="px-3 py-1.5">
									<StatusLabel {...rowState(row)} />
								</TableCell>
								<TableCell className="px-3 py-1.5 font-mono">
									{row.ids ?? ""}
								</TableCell>
								<TableCell className="px-3 py-1.5 text-right font-mono text-muted-foreground">
									{row.ms ?? ""}
								</TableCell>
								<TableCell className="max-w-0 truncate px-3 py-1.5 font-mono text-muted-foreground">
									{row.note ?? ""}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
