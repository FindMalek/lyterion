"use client";

import { buttonVariants } from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { CredentialForm } from "@/components/app/credential-form";
import { StatusLabel } from "@/components/app/status-dot";
import { CONNECTION_GROUPS, connectionState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { OnboardingShell } from "./onboarding-shell";

// Navidrome is required for a run; the rest is optional and stays editable under connections.
export function ServicesStep() {
	const list = useQuery(orpc.connections.list.queryOptions());
	const forms = useQuery(orpc.connections.forms.queryOptions());
	const [open, setOpen] = useState<string | null>("navidrome");
	const rows = new Map((list.data ?? []).map((r) => [r.id as string, r]));
	const navidrome = rows.get("navidrome");
	const navidromeOk = navidrome
		? connectionState(navidrome).status === "ok"
		: false;
	const ids = CONNECTION_GROUPS.flatMap((g) => g.ids).filter(
		(id) => id !== "spotify" && forms.data?.some((f) => f.kind === id),
	);

	return (
		<OnboardingShell step={3}>
			<p className="text-muted-foreground">
				Signed in, you own this instance. Connect Navidrome now; everything else
				is optional and can be set later under connections.
			</p>
			<ul className="flex flex-col divide-y border">
				{ids.map((id) => {
					const row = rows.get(id);
					const form = forms.data?.find((f) => f.kind === id);
					return (
						<li key={id}>
							<button
								type="button"
								className="flex h-8 w-full items-center justify-between gap-3 px-2 text-left hover:bg-muted/40"
								onClick={() => setOpen(open === id ? null : id)}
							>
								<span className="flex items-center gap-2">
									<span>{row?.label ?? id}</span>
									{id === "navidrome" && (
										<span className="font-mono text-[11px] text-muted-foreground">
											required
										</span>
									)}
								</span>
								{row ? (
									<StatusLabel {...connectionState(row)} />
								) : (
									<span className="font-mono text-muted-foreground">…</span>
								)}
							</button>
							{open === id && form && (
								<CredentialForm form={form} onClose={() => setOpen(null)} />
							)}
						</li>
					);
				})}
			</ul>
			<div className="flex items-center gap-2">
				<Link
					href="/"
					className={buttonVariants({
						size: "sm",
						variant: navidromeOk ? "default" : "outline",
					})}
				>
					{navidromeOk ? "done, open the overview" : "skip for now"}
				</Link>
			</div>
		</OnboardingShell>
	);
}
