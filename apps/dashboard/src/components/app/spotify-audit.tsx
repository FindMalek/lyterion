"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import {
	Button,
	Icons,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useMutation } from "@tanstack/react-query";

import { Section } from "@/components/shared/section";
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
		<Section
			title="Spotify endpoint audit"
			description="Calls every endpoint the export uses once, with your app and token: which ones dev mode still allows, and whether tracks carry an ISRC."
			actions={
				<Button
					size="xs"
					variant="outline"
					isLoading={audit.isPending}
					onClick={() => audit.mutate({})}
				>
					{!audit.isPending && <Icons.play />}
					Run audit
				</Button>
			}
		>
			{audit.error && (
				<p className="px-4 py-2 font-mono text-destructive text-xs">
					{audit.error.message}
				</p>
			)}
			{audit.data && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-48">Endpoint</TableHead>
							<TableHead className="w-32">Result</TableHead>
							<TableHead className="w-16">Ids</TableHead>
							<TableHead className="w-16 text-right">ms</TableHead>
							<TableHead className="hidden md:table-cell">Detail</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{audit.data.map((row) => (
							<TableRow key={row.name}>
								<TableCell>
									<div>{row.name}</div>
									<div className="font-mono text-[11px] text-muted-foreground">
										{row.path}
									</div>
								</TableCell>
								<TableCell>
									<StatusLabel {...rowState(row)} />
								</TableCell>
								<TableCell className="font-mono">{row.ids ?? ""}</TableCell>
								<TableCell className="text-right font-mono text-muted-foreground tabular-nums">
									{row.ms ?? ""}
								</TableCell>
								<TableCell className="hidden max-w-0 truncate font-mono text-muted-foreground md:table-cell">
									{row.note ?? ""}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Section>
	);
}
