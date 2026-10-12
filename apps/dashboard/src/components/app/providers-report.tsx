"use client";

import { cn } from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";

import { formatBytes, percent, recordingState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

function Count({
	label,
	value,
	tone,
}: {
	label: string;
	value: number | string;
	tone?: "ok" | "warn" | "error";
}) {
	return (
		<div className="flex flex-col gap-0.5 px-3 py-2">
			<span className="font-mono text-[11px] text-muted-foreground">
				{label}
			</span>
			<span
				className={cn(
					"font-mono text-sm",
					tone === "warn" && "text-warning",
					tone === "error" && "text-destructive",
				)}
			>
				{value}
			</span>
		</div>
	);
}

export function ProvidersReport() {
	const report = useQuery(orpc.library.report.queryOptions());
	const providers = useQuery(orpc.library.providers.queryOptions());
	const r = report.data;

	return (
		<>
			<section className="border-b">
				<div className="flex h-8 items-center border-b px-3">
					<h2 className="font-medium text-xs uppercase tracking-wide">
						Library report
					</h2>
				</div>
				{r && (
					<div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
						<Count
							label="in library"
							value={
								(r.byStatus.placed ?? 0) +
								(r.byStatus.linked ?? 0) +
								(r.byStatus.existing ?? 0)
							}
						/>
						<Count
							label="missing"
							value={r.byStatus.missing ?? 0}
							tone={r.byStatus.missing ? "error" : undefined}
						/>
						<Count
							label="review"
							value={r.byStatus.review ?? 0}
							tone={r.byStatus.review ? "warn" : undefined}
						/>
						<Count label="lossless" value={r.byQuality.lossless} />
						<Count label="transparent" value={r.byQuality.transparent} />
						<Count
							label="below transparent"
							value={r.byQuality.below_transparent}
							tone={r.byQuality.below_transparent ? "warn" : undefined}
						/>
						<Count label="size" value={formatBytes(r.bytes) || "0"} />
						<Count
							label="by source"
							value={
								Object.entries(r.byProvider)
									.map(([k, v]) => `${k} ${v}`)
									.join(" · ") || "·"
							}
						/>
					</div>
				)}
			</section>
			<section className="border-b">
				<div className="flex h-8 items-center border-b px-3">
					<h2 className="font-medium text-xs uppercase tracking-wide">
						Providers
					</h2>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="border-b text-left text-muted-foreground">
								<th className="h-7 px-3 font-normal">provider</th>
								<th className="h-7 px-3 font-normal">health</th>
								<th className="h-7 px-3 text-right font-normal">tried</th>
								<th className="h-7 px-3 text-right font-normal">chosen</th>
								<th className="h-7 px-3 text-right font-normal">verify fail</th>
								<th className="h-7 px-3 text-right font-normal">fetch fail</th>
								<th className="h-7 px-3 text-right font-normal">uptime 7d</th>
								<th className="h-7 px-3 font-normal">last 24h</th>
							</tr>
						</thead>
						<tbody>
							{(providers.data ?? []).map((p) => (
								<tr key={p.providerId} className="border-b">
									<td className="px-3 py-1.5 font-mono">{p.providerId}</td>
									<td className="px-3 py-1.5">
										{p.last ? (
											<StatusLabel
												status={p.last.ok ? "ok" : "error"}
												label={
													p.last.ok
														? `up ${p.last.latencyMs ?? "?"}ms`
														: (p.last.detail ?? "down")
												}
											/>
										) : (
											<StatusLabel status="idle" label="not checked" />
										)}
									</td>
									<td className="px-3 py-1.5 text-right font-mono">
										{p.tried}
									</td>
									<td className="px-3 py-1.5 text-right font-mono">
										{percent(p.successRate)}
									</td>
									<td className="px-3 py-1.5 text-right font-mono">
										{percent(p.verifyFailRate)}
									</td>
									<td className="px-3 py-1.5 text-right font-mono">
										{percent(p.fetchFailRate)}
									</td>
									<td className="px-3 py-1.5 text-right font-mono">
										{percent(p.uptime)}
									</td>
									<td className="px-3 py-1.5">
										<span className="flex h-3 items-end gap-px">
											{p.strip.map((ok, i) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed-order health strip
												<span
													key={i}
													className={cn(
														"h-full w-1",
														ok ? "bg-success" : "bg-destructive",
													)}
												/>
											))}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{providers.data && providers.data.length === 0 && (
					<p className="px-3 py-3 text-muted-foreground text-xs">
						No provider has been checked or used yet.
					</p>
				)}
			</section>
			<section>
				<div className="flex h-8 items-center border-b px-3">
					<h2 className="font-medium text-xs uppercase tracking-wide">
						Missing
					</h2>
				</div>
				{r && r.missing.length === 0 && (
					<p className="px-3 py-3 text-muted-foreground text-xs">
						Nothing missing.
					</p>
				)}
				<ul className="divide-y">
					{(r?.missing ?? []).map((m) => (
						<li
							key={m.id}
							className="flex items-center justify-between px-3 py-1.5 text-xs"
						>
							<span className="truncate">
								{m.artists.join(", ")} – {m.title}
							</span>
							<StatusLabel {...recordingState("missing")} />
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
