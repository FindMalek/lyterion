"use client";

import { cn, Icons } from "@lyterion/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { strFromU8, unzipSync } from "fflate";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/shared/section";
import { formatDateTime } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

const WANTED = /(^|\/)(Playlist\d*|YourLibrary)\.json$/i;

// Unzips in the browser and sends only the JSON Lyterion reads, so a large export never has to be uploaded.
async function readExport(fileList: FileList): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	for (const file of Array.from(fileList)) {
		if (file.name.toLowerCase().endsWith(".zip")) {
			const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
				filter: (f) => WANTED.test(f.name),
			});
			for (const [name, bytes] of Object.entries(entries))
				files[name] = strFromU8(bytes);
		} else if (WANTED.test(file.name)) {
			files[file.name] = await file.text();
		}
	}
	return files;
}

export function DataExportImport() {
	const queryClient = useQueryClient();
	const input = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [reading, setReading] = useState(false);
	const imports = useQuery({
		...orpc.runs.imports.queryOptions(),
		refetchInterval: 5_000,
		meta: { silent: true },
	});
	const upload = useMutation({
		...orpc.runs.importDataExport.mutationOptions(),
		onSuccess: (r) => {
			toast.success("Importing your data export", {
				description: `${r.playlists} playlists, ${r.items} entries, ${r.liked} likes`,
			});
			return queryClient.invalidateQueries({
				queryKey: orpc.runs.imports.key(),
			});
		},
		onError: (err) =>
			toast.error("Upload failed", { description: err.message }),
	});

	async function take(files: FileList | null) {
		if (!files?.length) return;
		setReading(true);
		try {
			const read = await readExport(files);
			if (Object.keys(read).length === 0)
				return toast.error("Nothing to import", {
					description: "No Playlist*.json or YourLibrary.json in that upload.",
				});
			upload.mutate({ files: read });
		} catch (err) {
			toast.error("Couldn't read that file", {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setReading(false);
		}
	}

	const busy = reading || upload.isPending;

	return (
		<Section
			title="Spotify data export"
			description="Playlists the API hides in dev mode (mostly ones you follow) can come from Spotify's “Download your data” export. Only the playlist and library JSON leave your browser."
		>
			<div className="p-3">
				<button
					type="button"
					disabled={busy}
					onClick={() => input.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						take(e.dataTransfer.files);
					}}
					className={cn(
						"flex w-full flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors",
						"hover:border-foreground/40 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60",
						dragging && "border-foreground bg-muted/60",
					)}
				>
					{busy ? (
						<Icons.spinner className="size-5 animate-spin text-muted-foreground" />
					) : (
						<Icons.upload className="size-5 text-muted-foreground" />
					)}
					<span className="text-xs">
						{busy
							? "Reading the export…"
							: "Drop my_spotify_data.zip here, or click to choose"}
					</span>
					<span className="font-mono text-[11px] text-muted-foreground">
						.zip or Playlist*.json · YourLibrary.json
					</span>
				</button>
				<input
					ref={input}
					type="file"
					accept=".zip,.json"
					multiple
					className="sr-only"
					onChange={(e) => {
						take(e.target.files);
						e.target.value = "";
					}}
				/>
			</div>
			{(imports.data ?? []).length > 0 && (
				<ul className="divide-y border-t">
					{(imports.data ?? []).map((i) => (
						<li
							key={i.id}
							className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]"
						>
							<StatusLabel
								status={
									i.status === "done"
										? "ok"
										: i.status === "failed"
											? "error"
											: "active"
								}
								label={i.status}
							/>
							<span className="font-mono text-muted-foreground">
								{formatDateTime(i.uploadedAt)} utc
							</span>
							{i.summary && (
								<span className="font-mono text-muted-foreground">
									{Object.entries(i.summary)
										.map(([k, v]) => `${k} ${String(v)}`)
										.join(" · ")}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
