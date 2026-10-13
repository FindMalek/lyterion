"use client";

import {
	Button,
	Icons,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@lyterion/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/shared/section";
import { orpc } from "@/shared/api/orpc";

function short(p: string) {
	const i = p.indexOf("/lyterion/");
	return i >= 0 ? p.slice(i + "/lyterion/".length) : p;
}

export function ReconcilePlan() {
	const { data } = useQuery(orpc.library.reconcilePlan.queryOptions());
	const reconcile = useMutation({
		...orpc.library.reconcile.mutationOptions(),
		onSuccess: () =>
			toast.success("Reconcile queued", {
				description: "Playlists and Navidrome follow once it's done.",
			}),
		onError: (err) => toast.error(err.message),
	});

	if (!data)
		return (
			<div className="flex flex-col gap-2 p-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		);
	if (data.moves.length === 0 && data.removals.length === 0)
		return (
			<EmptyState
				icon={Icons.circleCheck}
				title="Nothing to reconcile"
				description="Every file sits where its placement says, and every Lyterion file is still referenced."
			/>
		);

	return (
		<>
			<Section
				title="Dry run"
				description="Moves follow placement changes (a newly saved album, a merge). Removals are Lyterion-owned files nothing on Spotify points at anymore. Files outside lyterion/ are never touched."
				actions={
					<>
						<Button
							size="xs"
							variant="outline"
							disabled={data.moves.length === 0 || reconcile.isPending}
							onClick={() => reconcile.mutate({ remove: false })}
						>
							Apply {data.moves.length} moves
						</Button>
						{data.removals.length > 0 && (
							<ConfirmAction
								trigger={
									<Button
										size="xs"
										variant="destructive"
										disabled={reconcile.isPending}
									>
										<Icons.trash />
										Moves + remove {data.removals.length}
									</Button>
								}
								title={`Delete ${data.removals.length} files?`}
								description="These Lyterion-owned files aren't on Spotify anymore. They're deleted from disk along with their lyrics, and can only come back with a new run."
								confirm={`Delete ${data.removals.length} files`}
								destructive
								onConfirm={() => reconcile.mutate({ remove: true })}
							/>
						)}
					</>
				}
			/>
			{data.moves.length > 0 && (
				<Section title="Moves" count={data.moves.length}>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Track</TableHead>
								<TableHead>From</TableHead>
								<TableHead>To</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.moves.map((m) => (
								<TableRow key={m.fileId}>
									<TableCell className="max-w-56 truncate">{m.title}</TableCell>
									<TableCell className="max-w-96 truncate font-mono text-muted-foreground">
										{short(m.from)}
									</TableCell>
									<TableCell className="max-w-96 truncate font-mono">
										{short(m.to)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			)}
			{data.removals.length > 0 && (
				<Section title="Unreferenced" count={data.removals.length}>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Track</TableHead>
								<TableHead>File</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.removals.map((r) => (
								<TableRow key={r.fileId}>
									<TableCell className="max-w-56 truncate">
										{r.title ?? "(recording gone)"}
									</TableCell>
									<TableCell className="max-w-[40rem] truncate font-mono text-warning">
										{short(r.path)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			)}
		</>
	);
}
