"use client";

import { cn } from "@lyterion/ui";
import type { Route } from "next";
import Link from "next/link";

type Tab = { href: Route; label: string; count?: number; active: boolean };

/** Line tabs under a page header for views that are separate URLs, so each one can be linked and reloaded. */
export function PageTabs({ tabs }: { tabs: Tab[] }) {
	return (
		<nav
			aria-label="views"
			className="scrollbar-none flex gap-5 overflow-x-auto px-4"
		>
			{tabs.map((tab) => (
				<Link
					key={tab.href}
					href={tab.href}
					aria-current={tab.active ? "page" : undefined}
					className={cn(
						"relative flex h-10 shrink-0 items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground",
						"after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0 aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100",
					)}
				>
					{tab.label}
					{tab.count != null && (
						<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
							{tab.count}
						</span>
					)}
				</Link>
			))}
		</nav>
	);
}
