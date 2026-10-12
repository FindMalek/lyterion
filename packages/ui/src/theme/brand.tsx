import { Icons } from "../components/shared/icons";
import { cn } from "../lib/utils";

export const brandTokens = {
	name: "lyterion",
	tagline: "Your library, released.",
} as const;

export function LyterionBrandHeader({ className }: { className?: string }) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<Icons.logo className="size-3 text-foreground" />
			<span className="font-medium font-mono text-foreground text-sm">
				{brandTokens.name}
			</span>
		</div>
	);
}
