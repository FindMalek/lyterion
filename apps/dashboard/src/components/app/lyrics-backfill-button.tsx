"use client";

import { Button, Icons } from "@lyterion/ui";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/shared/api/orpc";

// New files get lyrics as they're placed; this fills in everything placed before (lyrics.backfill, D-050).
export function LyricsBackfillButton() {
	const backfill = useMutation({
		...orpc.library.lyricsBackfill.mutationOptions(),
		onSuccess: () =>
			toast.success("Fetching lyrics for the library", {
				description: "Runs in the background, about one track a second.",
			}),
		onError: (err) => toast.error(err.message),
	});
	return (
		<Button
			size="xs"
			variant="outline"
			isLoading={backfill.isPending}
			disabled={backfill.isSuccess}
			onClick={() => backfill.mutate({})}
		>
			{!backfill.isPending && <Icons.fileText />}
			{backfill.isSuccess ? "lyrics queued" : "fetch lyrics"}
		</Button>
	);
}
