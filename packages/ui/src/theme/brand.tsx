import { Icons } from "../components/shared/icons";
import { cn } from "../lib/utils";

export const brandTokens = {
	name: "lyterion",
	tagline: "Your library, released.",
} as const;

export function LyterionBrandHeader({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<Icons.logo className="size-4 text-foreground" />
			<span className="font-mono font-semibold text-base text-foreground tracking-tight">
				{brandTokens.name}
			</span>
		</div>
	);
}
