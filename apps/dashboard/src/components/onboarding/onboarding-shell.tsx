import {
	Alert,
	AlertDescription,
	cn,
	Icons,
	LyterionBrandHeader,
} from "@lyterion/ui";
import type * as React from "react";

import { StatusDot } from "@/components/app/status-dot";

export const ONBOARDING_STEPS = [
	"setup code",
	"spotify app",
	"sign in",
	"services",
] as const;

// Same frame for every step: brand, the step rail, then the step itself.
export function OnboardingShell({
	step,
	children,
}: {
	step: number;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-svh items-start justify-center bg-background px-4 py-8 sm:items-center">
			<div className="flex w-full max-w-xl flex-col border">
				<div className="border-b p-3">
					<LyterionBrandHeader />
				</div>
				<ol className="grid grid-cols-4 border-b">
					{ONBOARDING_STEPS.map((label, i) => (
						<li
							key={label}
							className="flex h-8 min-w-0 items-center gap-1.5 border-r px-2 font-mono text-[11px] last:border-r-0 sm:gap-2 sm:px-3 sm:text-xs"
						>
							<StatusDot
								status={i < step ? "ok" : i === step ? "active" : "idle"}
							/>
							<span
								className={cn(
									"truncate",
									i === step ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{i + 1}. {label}
							</span>
						</li>
					))}
				</ol>
				<div className="flex flex-col gap-3 p-3 text-xs">{children}</div>
			</div>
		</div>
	);
}

export function StepError({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<Alert variant="destructive">
			<Icons.alertCircle />
			<AlertDescription className="break-all font-mono">
				{message}
			</AlertDescription>
		</Alert>
	);
}
