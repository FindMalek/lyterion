import type * as React from "react";

type Props = {
	title: string;
	description?: string;
	actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
	return (
		<div className="flex h-9 items-center justify-between gap-3 border-b px-3">
			<div className="flex min-w-0 items-baseline gap-2">
				<h1 className="font-medium text-foreground text-sm">{title}</h1>
				{description && (
					<p className="truncate text-muted-foreground text-xs">
						{description}
					</p>
				)}
			</div>
			{actions}
		</div>
	);
}
