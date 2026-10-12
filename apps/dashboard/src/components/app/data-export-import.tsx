"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { strFromU8, unzipSync } from "fflate";
import { useState } from "react";

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
	const imports = useQuery({
		...orpc.runs.imports.queryOptions(),
		refetchInterval: 5_000,
		meta: { silent: true },
	});
	const [readError, setReadError] = useState<string | null>(null);
	const upload = useMutation({
		...orpc.runs.importDataExport.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orpc.runs.imports.key() }),
	});

	return (
		<section className="border-t">
			<div className="flex h-8 items-center border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					Spotify data export
				</h2>
			</div>
			<div className="flex flex-col gap-2 px-3 py-2 text-xs">
				<p className="text-muted-foreground">
					Playlists the API hides in dev mode (mostly ones you follow) can come
					from Spotify's "Download your data" export (Account data). Drop the
					zip here; only the playlist and library JSON leave your browser.
				</p>
				<input
					type="file"
					accept=".zip,.json"
					multiple
					className="font-mono text-xs file:mr-3 file:border file:bg-background file:px-2 file:py-1 file:font-mono file:text-xs"
					onChange={async (e) => {
						setReadError(null);
						if (!e.target.files?.length) return;
						try {
							const files = await readExport(e.target.files);
							if (Object.keys(files).length === 0)
								return setReadError(
									"no Playlist*.json or YourLibrary.json in that upload",
								);
							upload.mutate({ files });
						} catch (err) {
							setReadError(err instanceof Error ? err.message : String(err));
						}
					}}
				/>
				{(readError ?? upload.error?.message) && (
					<span className="font-mono text-destructive">
						{readError ?? upload.error?.message}
					</span>
				)}
				{upload.data && (
					<span className="font-mono text-success">
						read {upload.data.playlists} playlists, {upload.data.items} entries,{" "}
						{upload.data.liked} likes; importing
					</span>
				)}
				{(imports.data ?? []).map((i) => (
					<div
						key={i.id}
						className="flex flex-wrap items-center gap-3 font-mono text-muted-foreground"
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
						<span>{formatDateTime(i.uploadedAt)} utc</span>
						{i.summary && (
							<span>
								{Object.entries(i.summary)
									.map(([k, v]) => `${k} ${String(v)}`)
									.join(" · ")}
							</span>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
