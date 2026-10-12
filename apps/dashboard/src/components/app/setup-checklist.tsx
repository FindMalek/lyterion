"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { connectionState, REQUIRED_CONNECTIONS } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusDot } from "./status-dot";

const STEPS: Record<string, string> = {
	spotify: "sign in with spotify",
	navidrome: "connect navidrome (url, user, password)",
	trigger: "connect trigger.dev so runs can start",
};

// Shown only while something the first migration needs is missing.
export function SetupChecklist() {
	const { data } = useQuery(orpc.connections.list.queryOptions());
	if (!data) return null;
	const needed = [...REQUIRED_CONNECTIONS, "trigger"].flatMap(
		(id) => data.find((row) => row.id === id) ?? [],
	);
	const missing = needed.filter((row) => connectionState(row).status !== "ok");
	if (missing.length === 0) return null;

	return (
		<section className="border-b">
			<div className="flex h-8 items-center justify-between border-b px-3">
				<h2 className="font-medium text-xs uppercase tracking-wide">Setup</h2>
				<span className="font-mono text-muted-foreground text-xs">
					{needed.length - missing.length}/{needed.length} done
				</span>
			</div>
			<ol className="divide-y">
				{needed.map((row) => {
					const { status } = connectionState(row);
					return (
						<li
							key={row.id}
							className="flex h-8 items-center justify-between gap-3 px-3 text-xs"
						>
							<span className="flex items-center gap-2">
								<StatusDot status={status} />
								<span
									className={
										status === "ok" ? "text-muted-foreground line-through" : ""
									}
								>
									{STEPS[row.id] ?? row.label}
								</span>
							</span>
							{status !== "ok" && (
								<Link
									href={`/connections?edit=${row.id}`}
									className="font-mono text-muted-foreground hover:text-foreground"
								>
									set up →
								</Link>
							)}
						</li>
					);
				})}
			</ol>
		</section>
	);
}
