import { cn } from "@lyterion/ui";

export type Status = "ok" | "warn" | "error" | "idle";

const COLOR: Record<Status, string> = {
	ok: "bg-success",
	warn: "bg-warning",
	error: "bg-destructive",
	idle: "bg-muted-foreground/40",
};

export function StatusDot({ status }: { status: Status }) {
	return (
		<span aria-hidden className={cn("inline-block size-1.5", COLOR[status])} />
	);
}
