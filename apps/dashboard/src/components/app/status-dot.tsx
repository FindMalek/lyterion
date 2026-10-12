import { cn } from "@lyterion/ui";

// Color only means something: green done, orange needs attention, red broken, pulsing white in progress.
export type Status = "ok" | "warn" | "error" | "active" | "idle";

const COLOR: Record<Status, string> = {
	ok: "bg-success",
	warn: "bg-warning",
	error: "bg-destructive",
	active: "bg-foreground animate-pulse",
	idle: "bg-muted-foreground/40",
};

export function StatusDot({ status }: { status: Status }) {
	return (
		<span
			aria-hidden
			className={cn("inline-block size-1.5 shrink-0", COLOR[status])}
		/>
	);
}

export function StatusLabel({
	status,
	label,
}: {
	status: Status;
	label: string;
}) {
	return (
		<span className="inline-flex items-center gap-2">
			<StatusDot status={status} />
			<span
				className={cn(
					"font-mono",
					status === "idle" && "text-muted-foreground",
					status === "error" && "text-destructive",
					status === "warn" && "text-warning",
				)}
			>
				{label}
			</span>
		</span>
	);
}
