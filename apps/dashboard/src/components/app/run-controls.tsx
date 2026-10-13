"use client";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Icons,
} from "@lyterion/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { orpc } from "@/shared/api/orpc";

// Start, restart (stops the run going, D-047) and the one-off final export (D-029).
export function RunControls() {
	const queryClient = useQueryClient();
	const runs = useQuery({
		...orpc.runs.list.queryOptions(),
		meta: { silent: true },
	});
	const sync = useQuery({
		...orpc.runs.syncState.queryOptions(),
		meta: { silent: true },
	});
	const [finalOpen, setFinalOpen] = useState(false);
	const start = useMutation({
		...orpc.runs.start.mutationOptions(),
		onSuccess: ({ runId, superseded }) => {
			toast.success(`Run #${runId} started`, {
				description: superseded
					? "The previous run was stopped and its queued tasks cancelled."
					: "Exporting what changed on Spotify, then finding every track.",
			});
			return queryClient.invalidateQueries({ queryKey: orpc.runs.list.key() });
		},
		onError: (err) =>
			toast.error("Couldn't start a run", { description: err.message }),
	});
	const running = runs.data?.some((r) => r.status === "running") ?? false;

	const startButton = (
		<Button
			isLoading={start.isPending}
			onClick={running ? undefined : () => start.mutate({})}
		>
			{!start.isPending && (running ? <Icons.refresh /> : <Icons.play />)}
			{running ? "Restart run" : "Start run"}
		</Button>
	);

	return (
		<>
			{running ? (
				<ConfirmAction
					trigger={startButton}
					title="Restart the run?"
					description="The run going now stops and its queued tasks are cancelled. A new run starts from an incremental export; tracks already placed are never redone."
					confirm="Stop and restart"
					onConfirm={() => start.mutate({})}
				/>
			) : (
				startButton
			)}
			{sync.data?.dailySync !== false && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="outline" aria-label="More run actions">
							<Icons.dots />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem
							disabled={running}
							onSelect={() => setFinalOpen(true)}
						>
							<Icons.download />
							Final export…
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			<ConfirmAction
				open={finalOpen}
				onOpenChange={setFinalOpen}
				title="Run the final export?"
				description="A full export of everything on Spotify, then the daily sync turns off. Do this right before cancelling Premium, while dev-mode access still works."
				confirm="Run final export"
				onConfirm={() => start.mutate({ mode: "final" })}
			/>
		</>
	);
}
