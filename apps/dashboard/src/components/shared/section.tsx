import { cn } from "@lyterion/ui";
import type * as React from "react";
import { Children } from "react";

type Props = {
	title: string;
	count?: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
};

/** A titled block of a page: the same header height, type and action slot everywhere. */
export function Section({
	title,
	count,
	description,
	actions,
	children,
	className,
}: Props) {
	return (
		<section className={cn("border-b last:border-b-0", className)}>
			<div
				className={cn(
					"flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2",
					Children.toArray(children).length > 0 && "border-b",
				)}
			>
				<h2 className="font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
					{title}
					{count != null && (
						<span className="ml-2 font-mono text-foreground tabular-nums">
							{count}
						</span>
					)}
				</h2>
				{description && (
					<p className="min-w-0 flex-1 basis-64 text-[13px] text-muted-foreground">
						{description}
					</p>
				)}
				{actions && (
					<div className="ml-auto flex shrink-0 items-center gap-2">
						{actions}
					</div>
				)}
			</div>
			{children}
		</section>
	);
}
