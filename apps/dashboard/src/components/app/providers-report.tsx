"use client";

import {
	cn,
	Icons,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { Stat, StatGrid } from "@/components/shared/stat";
import { formatBytes, percent } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

export function ProvidersReport() {
	const report = useQuery(orpc.library.report.queryOptions());
	const providers = useQuery(orpc.library.providers.queryOptions());
	const r = report.data;
	const n = (v: number | undefined) =>
		r ? (v ?? 0).toLocaleString() : undefined;

	return (
		<>
			<StatGrid>
				<Stat
					label="In library"
					value={n(
						r &&
							(r.byStatus.placed ?? 0) +
								(r.byStatus.linked ?? 0) +
								(r.byStatus.existing ?? 0),
					)}
					hint={r && (formatBytes(r.bytes) || "0MB")}
				/>
				<Stat
					label="Lossless"
					value={n(r?.byQuality.lossless)}
					hint="FLAC, verified by spectrum"
				/>
				<Stat
					label="Transparent"
					value={n(r?.byQuality.transparent)}
					hint="lossy you can't tell apart"
				/>
				<Stat
					label="Below transparent"
					value={n(r?.byQuality.below_transparent)}
					tone={r?.byQuality.below_transparent ? "warn" : undefined}
					hint="queued for an upgrade"
				/>
			</StatGrid>
			<Section
				title="Sources"
				count={providers.data?.length}
				description={
					r &&
					Object.entries(r.byProvider)
						.sort(([, a], [, b]) => b - a)
						.map(([k, v]) => `${k} ${v.toLocaleString()}`)
						.join(" · ")
				}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-28">Provider</TableHead>
							<TableHead className="w-40">Health</TableHead>
							<TableHead className="w-20 text-right">Tried</TableHead>
							<TableHead className="w-20 text-right">Chosen</TableHead>
							<TableHead className="hidden w-24 text-right md:table-cell">
								Verify fail
							</TableHead>
							<TableHead className="hidden w-24 text-right md:table-cell">
								Fetch fail
							</TableHead>
							<TableHead className="hidden w-24 text-right lg:table-cell">
								Uptime 7d
							</TableHead>
							<TableHead className="hidden sm:table-cell">Last 24h</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{!providers.data &&
							[0, 1, 2].map((i) => (
								<TableRow key={i}>
									<TableCell colSpan={8}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								</TableRow>
							))}
						{(providers.data ?? []).map((p) => (
							<TableRow key={p.providerId}>
								<TableCell className="font-mono">{p.providerId}</TableCell>
								<TableCell>
									{p.last ? (
										<StatusLabel
											status={p.last.ok ? "ok" : "error"}
											label={
												p.last.ok
													? `up · ${p.last.latencyMs ?? "?"}ms`
													: (p.last.detail ?? "down")
											}
										/>
									) : (
										<StatusLabel status="idle" label="not checked" />
									)}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums">
									{p.tried.toLocaleString()}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums">
									{percent(p.successRate)}
								</TableCell>
								<TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums md:table-cell">
									{percent(p.verifyFailRate)}
								</TableCell>
								<TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums md:table-cell">
									{percent(p.fetchFailRate)}
								</TableCell>
								<TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
									{percent(p.uptime)}
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="flex h-3.5 w-fit items-end gap-px">
												{p.strip.map((ok, i) => (
													// biome-ignore lint/suspicious/noArrayIndexKey: fixed-order health strip
													<span
														key={i}
														className={cn(
															"h-full w-1",
															ok ? "bg-success/80" : "bg-destructive",
														)}
													/>
												))}
											</span>
										</TooltipTrigger>
										<TooltipContent>
											{p.strip.filter(Boolean).length}/{p.strip.length} checks
											passed in the last 24h, oldest first
										</TooltipContent>
									</Tooltip>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				{providers.data && providers.data.length === 0 && (
					<EmptyState
						icon={Icons.server}
						title="No source used yet"
						description="Health checks and hit rates appear once a run starts searching."
					/>
				)}
			</Section>
			<Section
				title="Missing"
				count={r?.missing.length}
				description="No source had a file that passed verification. They're retried on the next run and by the weekly upgrade."
			>
				{r && r.missing.length === 0 ? (
					<EmptyState
						icon={Icons.circleCheck}
						title="Nothing missing"
						description="Every track found a verified file."
					/>
				) : (
					<ul className="divide-y">
						{(r?.missing ?? []).map((m) => (
							<li
								key={m.id}
								className="flex items-center gap-3 px-4 py-2 text-[13px]"
							>
								<span className="size-1.5 shrink-0 bg-destructive" />
								<span className="min-w-0 flex-1 truncate">{m.title}</span>
								<span className="max-w-[40%] truncate text-muted-foreground">
									{m.artists.join(", ")}
								</span>
							</li>
						))}
					</ul>
				)}
			</Section>
		</>
	);
}
