"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import {
	Button,
	Icons,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	ToggleGroup,
	ToggleGroupItem,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@lyterion/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatBytes, formatQuality, recordingState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

// Pipeline order for the filter chips; any status not listed (a new one) goes last.
const ORDER = [
	"placed",
	"linked",
	"existing",
	"waiting",
	"queued",
	"searching",
	"fetching",
	"verifying",
	"review",
	"missing",
	"resolved",
	"pending",
	"skipped",
];

type StatusFilter = NonNullable<
	Parameters<AppRouterClient["library"]["list"]>[0]
>["status"];

function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

export function LibraryTable() {
	const [status, setStatus] = useState("all");
	const [search, setSearch] = useState("");
	const [offset, setOffset] = useState(0);
	const query = useDebounced(search.trim(), 250);
	const { data, isFetching } = useQuery({
		...orpc.library.list.queryOptions({
			input: {
				status: status === "all" ? undefined : (status as StatusFilter),
				search: query || undefined,
				offset,
			},
		}),
		placeholderData: keepPreviousData,
	});
	const totals = data?.totals ?? {};
	const all = Object.values(totals).reduce((a, b) => a + Number(b), 0);
	const statuses = Object.keys(totals).sort(
		(a, b) =>
			(ORDER.includes(a) ? ORDER.indexOf(a) : 99) -
			(ORDER.includes(b) ? ORDER.indexOf(b) : 99),
	);
	const pageSize = data?.pageSize ?? 100;
	const rows = data?.rows ?? [];
	const filtered = query
		? undefined
		: status === "all"
			? all
			: Number(totals[status] ?? 0);

	return (
		<>
			<div className="flex flex-col gap-2 border-b px-4 py-2.5 lg:flex-row lg:items-center">
				<ToggleGroup
					type="single"
					size="sm"
					variant="outline"
					value={status}
					onValueChange={(v) => {
						setStatus(v || "all");
						setOffset(0);
					}}
					className="scrollbar-none max-w-full overflow-x-auto"
				>
					<ToggleGroupItem value="all" className="gap-1.5 font-mono text-xs">
						all
						<span className="text-muted-foreground tabular-nums">{all}</span>
					</ToggleGroupItem>
					{statuses.map((s) => (
						<ToggleGroupItem
							key={s}
							value={s}
							className="gap-1.5 font-mono text-xs"
						>
							{s}
							<span className="text-muted-foreground tabular-nums">
								{totals[s]}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<InputGroup className="h-7 lg:ml-auto lg:w-64">
					<InputGroupAddon>
						{isFetching && query ? (
							<Icons.spinner className="animate-spin" />
						) : (
							<Icons.search />
						)}
					</InputGroupAddon>
					<InputGroupInput
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setOffset(0);
						}}
						placeholder="Search title or artist"
						aria-label="Search title or artist"
						className="text-xs"
					/>
				</InputGroup>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Title</TableHead>
						<TableHead className="hidden md:table-cell">Artist</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-32">Quality</TableHead>
						<TableHead className="hidden w-24 lg:table-cell">Source</TableHead>
						<TableHead className="hidden w-20 text-right sm:table-cell">
							Size
						</TableHead>
						<TableHead className="hidden w-36 xl:table-cell">Flag</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{!data &&
						Array.from({ length: 8 }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows
							<TableRow key={i}>
								<TableCell colSpan={7}>
									<Skeleton className="h-4 w-full" />
								</TableCell>
							</TableRow>
						))}
					{rows.map((row) => (
						<TableRow key={`${row.id}-${row.path ?? ""}`}>
							<TableCell className="max-w-72">
								<div className="truncate">{row.title}</div>
								<div className="truncate text-[11px] text-muted-foreground md:hidden">
									{row.artists.join(", ")}
								</div>
							</TableCell>
							<TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
								{row.artists.join(", ")}
							</TableCell>
							<TableCell>
								<StatusLabel {...recordingState(row.status)} />
							</TableCell>
							<TableCell className="font-mono">
								{formatQuality(row)}
								{row.verifiedLossless && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Icons.circleCheck className="ml-1 inline size-3 text-success" />
										</TooltipTrigger>
										<TooltipContent>
											Verified lossless by its spectrum
										</TooltipContent>
									</Tooltip>
								)}
							</TableCell>
							<TableCell className="hidden font-mono text-muted-foreground lg:table-cell">
								{row.owned === false ? "existing" : (row.sourceProvider ?? "")}
							</TableCell>
							<TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
								{formatBytes(row.sizeBytes)}
							</TableCell>
							<TableCell className="hidden font-mono text-warning xl:table-cell">
								{row.path ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="cursor-default">
												{row.upgradeReason ?? (
													<span className="text-muted-foreground/50">·</span>
												)}
											</span>
										</TooltipTrigger>
										<TooltipContent className="max-w-md break-all font-mono">
											{row.path}
										</TooltipContent>
									</Tooltip>
								) : (
									(row.upgradeReason ?? "")
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{data && rows.length === 0 && (
				<EmptyState
					icon={query ? Icons.search : Icons.library}
					title={query ? `Nothing matches “${query}”` : "No recordings here"}
					description={
						query
							? "Search looks at titles and artists. Try fewer words."
							: "Recordings appear after a run resolves your Spotify library."
					}
				/>
			)}
			{rows.length > 0 && (
				<div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{(offset + 1).toLocaleString()}–
						{(offset + rows.length).toLocaleString()}
						{filtered != null && ` of ${filtered.toLocaleString()}`}
					</span>
					<div className="flex gap-1">
						<Button
							size="icon-sm"
							variant="outline"
							aria-label="Previous page"
							disabled={offset === 0}
							onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
						>
							<Icons.chevronLeft />
						</Button>
						<Button
							size="icon-sm"
							variant="outline"
							aria-label="Next page"
							disabled={rows.length < pageSize}
							onClick={() => setOffset((o) => o + pageSize)}
						>
							<Icons.chevronRight />
						</Button>
					</div>
				</div>
			)}
		</>
	);
}
