"use client";

import {
	Button,
	Icons,
	Sheet,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Section } from "@/components/shared/section";
import {
	CONNECTION_GROUPS,
	type ConnectionRow,
	connectionState,
} from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { CredentialForm } from "./credential-form";
import { StatusLabel } from "./status-dot";

// Services without a form: Spotify through sign-in, the rest by the deploy.
const NO_FORM: Record<string, string> = {
	spotify: "sign-in",
	youtube: "always on",
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
	const byId = new Map<string, ConnectionRow>(
		(data ?? []).map((row) => [row.id, row]),
	);
	// The open form lives in the URL, so the setup checklist can link straight to it.
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const editing = params.get("edit");
	const form = editing ? formById.get(editing) : undefined;
	const setEditing = (id: string | null) =>
		router.replace((id ? `${pathname}?edit=${id}` : pathname) as Route, {
			scroll: false,
		});

	return (
		<>
			{CONNECTION_GROUPS.map((group, gi) => {
				const rows = group.ids.flatMap((id) => byId.get(id) ?? []);
				const ready = rows.filter(
					(r) => connectionState(r).status === "ok",
				).length;
				return (
					<Section
						key={group.title}
						title={group.title}
						count={data ? `${ready}/${rows.length}` : undefined}
						actions={
							gi === 0 && (
								<Button
									size="xs"
									variant="ghost"
									onClick={() => refetch()}
									isLoading={isFetching}
								>
									{!isFetching && <Icons.refresh />}
									Recheck
								</Button>
							)
						}
					>
						<Table>
							<TableHeader className="sr-only">
								<TableRow>
									<TableHead>Service</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Latency</TableHead>
									<TableHead>Detail</TableHead>
									<TableHead>Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{!data &&
									group.ids.map((id) => (
										<TableRow key={id}>
											<TableCell colSpan={5}>
												<Skeleton className="h-4 w-full" />
											</TableCell>
										</TableRow>
									))}
								{rows.map((row) => {
									const hasForm = formById.has(row.id);
									return (
										<TableRow key={row.id}>
											<TableCell className="w-44 font-medium">
												{row.label}
											</TableCell>
											<TableCell className="w-32">
												<StatusLabel {...connectionState(row)} />
											</TableCell>
											<TableCell className="hidden w-20 text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
												{row.latencyMs === null ? "" : `${row.latencyMs}ms`}
											</TableCell>
											<TableCell className="hidden max-w-0 truncate font-mono text-muted-foreground md:table-cell">
												{row.detail ?? ""}
											</TableCell>
											<TableCell className="w-24 text-right">
												{hasForm ? (
													<Button
														size="xs"
														variant={row.configured ? "ghost" : "outline"}
														onClick={() => setEditing(row.id)}
													>
														{row.configured ? "Edit" : "Set up"}
													</Button>
												) : (
													<span className="font-mono text-[11px] text-muted-foreground">
														{NO_FORM[row.id] ?? ""}
													</span>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</Section>
				);
			})}
			<Sheet open={!!form} onOpenChange={(open) => !open && setEditing(null)}>
				{form && (
					<CredentialForm
						key={form.kind}
						form={form}
						row={byId.get(form.kind)}
						onClose={() => setEditing(null)}
					/>
				)}
			</Sheet>
		</>
	);
}
