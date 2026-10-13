import { Badge, cn } from "@lyterion/ui";

// Color only means something: green done, amber needs attention, red broken, pulsing in progress (D-015).
export type Status = "ok" | "warn" | "error" | "active" | "idle";

const DOT: Record<Status, string> = {
	ok: "bg-success",
	warn: "bg-warning",
	error: "bg-destructive",
	active: "bg-foreground animate-pulse",
	idle: "bg-muted-foreground/40",
};

const TEXT: Record<Status, string> = {
	ok: "text-foreground",
	warn: "text-warning",
	error: "text-destructive",
	active: "text-foreground",
	idle: "text-muted-foreground",
};

const BADGE: Record<Status, string> = {
	ok: "border-success/30 bg-success/10 text-success",
	warn: "border-warning/30 bg-warning/10 text-warning",
	error: "border-destructive/30 bg-destructive/10 text-destructive",
	active: "border-border bg-muted text-foreground",
	idle: "border-border text-muted-foreground",
};

export function StatusDot({
	status,
	className,
}: {
	status: Status;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn("inline-block size-1.5 shrink-0", DOT[status], className)}
		/>
	);
}

/** Inline dot and label, for dense table cells. */
export function StatusLabel({
	status,
	label,
	className,
}: {
	status: Status;
	label: string;
	className?: string;
}) {
	return (
		<span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
			<StatusDot status={status} />
			<span className={cn("truncate font-mono", TEXT[status])}>{label}</span>
		</span>
	);
}

/** Boxed status, for headers and cards where the state is the point. */
export function StatusBadge({
	status,
	label,
	className,
}: {
	status: Status;
	label: string;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn("gap-1.5 font-mono font-normal", BADGE[status], className)}
		>
			<StatusDot status={status} />
			{label}
		</Badge>
	);
}
