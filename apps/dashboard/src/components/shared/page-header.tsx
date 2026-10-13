"use client";

import { Separator, SidebarTrigger } from "@lyterion/ui";
import type * as React from "react";

type Props = {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	children?: React.ReactNode;
};

// One sticky bar per page: sidebar toggle, title, a one-line description, and the page's actions on the right.
export function PageHeader({ title, description, actions, children }: Props) {
	return (
		<header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<div className="flex h-14 items-center gap-3 px-4">
				<SidebarTrigger className="-ml-1" />
				<Separator orientation="vertical" className="mr-1 h-4" />
				<div className="flex min-w-0 flex-1 items-baseline gap-2">
					<h1 className="shrink-0 font-semibold text-base tracking-tight">
						{title}
					</h1>
					{description && (
						<p className="hidden truncate text-muted-foreground text-sm sm:block">
							{description}
						</p>
					)}
				</div>
				{actions && (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				)}
			</div>
			{children}
		</header>
	);
}
