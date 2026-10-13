import { cn, Skeleton } from "@lyterion/ui";
import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

type Tone = "ok" | "warn" | "error";

const TONE: Record<Tone, string> = {
	ok: "text-success",
	warn: "text-warning",
	error: "text-destructive",
};

// A 9px "+" centred on a grid intersection, the registration mark of the boxed look.
function Cross({ className }: { className: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				"pointer-events-none absolute z-10 size-[9px]",
				"before:absolute before:top-1/2 before:left-0 before:h-px before:w-full before:-translate-y-1/2 before:bg-foreground/50",
				"after:absolute after:top-0 after:left-1/2 after:h-full after:w-px after:-translate-x-1/2 after:bg-foreground/50",
				className,
			)}
		/>
	);
}

/** Equal-width tiles on hairlines with crosshair corners, two columns on a phone. */
export function StatGrid({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("relative border-b", className)}>
			<div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
				{children}
			</div>
			<Cross className="-bottom-[5px] -left-[5px]" />
			<Cross className="-right-[5px] -bottom-[5px]" />
		</div>
	);
}

export function Stat({
	label,
	value,
	hint,
	tone,
	href,
}: {
	label: string;
	value: React.ReactNode | undefined;
	hint?: React.ReactNode;
	tone?: Tone;
	href?: Route;
}) {
	const body = (
		<>
			<span className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
				{label}
				{href && (
					<span className="opacity-0 transition-opacity group-hover/stat:opacity-100">
						→
					</span>
				)}
			</span>
			{value === undefined ? (
				<Skeleton className="h-9 w-24" />
			) : (
				<span
					className={cn(
						"font-medium font-mono text-3xl tabular-nums leading-none tracking-tight",
						tone && TONE[tone],
					)}
				>
					{value}
				</span>
			)}
			{hint && (
				<span className="truncate text-muted-foreground text-xs">{hint}</span>
			)}
		</>
	);
	const className =
		"group/stat flex min-w-0 flex-col gap-3 bg-background px-4 py-5";
	return href ? (
		<Link
			href={href}
			className={cn(className, "transition-colors hover:bg-muted/40")}
		>
			{body}
		</Link>
	) : (
		<div className={className}>{body}</div>
	);
}
