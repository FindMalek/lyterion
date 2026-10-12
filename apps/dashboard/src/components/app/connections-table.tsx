"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import {
	CONNECTION_GROUPS,
	type ConnectionRow,
	connectionState,
} from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { CredentialForm, type CredentialFormSpec } from "./credential-form";
import { StatusLabel } from "./status-dot";

// Services without a form are configured by the deploy (spotify via sign-in, trigger and yt-dlp by env).
const DEPLOY_NOTE: Record<string, string> = {
	spotify: "sign-in",
	youtube: "deploy env",
	trigger: "deploy env",
};

export function ConnectionsTable() {
	const { data, isFetching, refetch } = useQuery(
		orpc.connections.list.queryOptions(),
	);
	const forms = useQuery(orpc.connections.forms.queryOptions());
	const formById = new Map(
		(forms.data ?? []).map((f) => [f.kind as string, f]),
	);
	const [editing, setEditing] = useState<string | null>(
		useSearchParams().get("edit"),
	);
	const byId = new Map<string, ConnectionRow>(
		(data ?? []).map((row) => [row.id, row]),
	);

	return (
		<section>
			<div className="flex h-8 items-center justify-between border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					Services
				</h2>
				<button
					type="button"
					className="font-mono text-muted-foreground text-xs hover:text-foreground"
					onClick={() => refetch()}
				>
					{isFetching ? "checking…" : "recheck"}
				</button>
			</div>
			<Table className="text-xs">
				<TableHeader>
					<TableRow>
						<TableHead className="h-7 w-48 px-3">service</TableHead>
						<TableHead className="h-7 w-36 px-3">status</TableHead>
						<TableHead className="h-7 w-20 px-3 text-right">latency</TableHead>
						<TableHead className="h-7 px-3">detail</TableHead>
						<TableHead className="h-7 w-20 px-3 text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{CONNECTION_GROUPS.map((group) => (
						<GroupRows
							key={group.title}
							title={group.title}
							rows={group.ids.flatMap((id) => byId.get(id) ?? [])}
							loading={!data}
							forms={formById}
							editing={editing}
							onEdit={setEditing}
						/>
					))}
				</TableBody>
			</Table>
		</section>
	);
}

function GroupRows({
	title,
	rows,
	loading,
	forms,
	editing,
	onEdit,
}: {
	title: string;
	rows: ConnectionRow[];
	loading: boolean;
	forms: Map<string, CredentialFormSpec>;
	editing: string | null;
	onEdit: (id: string | null) => void;
}) {
	return (
		<>
			<TableRow className="hover:bg-transparent">
				<TableCell
					colSpan={5}
					className="bg-muted/40 px-3 py-1 font-mono text-[11px] text-muted-foreground"
				>
					{title.toLowerCase()}
				</TableCell>
			</TableRow>
			{loading && (
				<TableRow>
					<TableCell
						colSpan={5}
						className="px-3 py-1.5 font-mono text-muted-foreground"
					>
						checking…
					</TableCell>
				</TableRow>
			)}
			{rows.map((row) => {
				const form = forms.get(row.id);
				const open = editing === row.id && form;
				return (
					<Fragment key={row.id}>
						<TableRow data-state={open ? "selected" : undefined}>
							<TableCell className="px-3 py-1.5">{row.label}</TableCell>
							<TableCell className="px-3 py-1.5">
								<StatusLabel {...connectionState(row)} />
							</TableCell>
							<TableCell className="px-3 py-1.5 text-right font-mono text-muted-foreground">
								{row.latencyMs === null ? "" : `${row.latencyMs}ms`}
							</TableCell>
							<TableCell className="max-w-0 truncate px-3 py-1.5 font-mono text-muted-foreground">
								{row.detail ?? ""}
							</TableCell>
							<TableCell className="px-3 py-1.5 text-right">
								{form ? (
									<button
										type="button"
										className="font-mono text-muted-foreground text-xs hover:text-foreground"
										onClick={() => onEdit(open ? null : row.id)}
									>
										{open ? "close" : row.configured ? "edit" : "set up"}
									</button>
								) : (
									<span className="font-mono text-muted-foreground/60 text-xs">
										{DEPLOY_NOTE[row.id] ?? ""}
									</span>
								)}
							</TableCell>
						</TableRow>
						{open && (
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={5} className="whitespace-normal p-0">
									<CredentialForm
										key={form.kind}
										form={form}
										onClose={() => onEdit(null)}
									/>
								</TableCell>
							</TableRow>
						)}
					</Fragment>
				);
			})}
		</>
	);
}
