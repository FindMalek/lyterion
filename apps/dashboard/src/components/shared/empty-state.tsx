import type { Icon } from "@lyterion/ui";
import {
	cn,
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	Icons,
} from "@lyterion/ui";
import type * as React from "react";

type Props = {
	icon?: Icon;
	title: string;
	description?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
};

/** What a page or section shows when there's nothing yet: why, and what makes something appear. */
export function EmptyState({
	icon: Icon = Icons.music,
	title,
	description,
	children,
	className,
}: Props) {
	return (
		<Empty className={cn("py-10", className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				{description && <EmptyDescription>{description}</EmptyDescription>}
			</EmptyHeader>
			{children && <EmptyContent>{children}</EmptyContent>}
		</Empty>
	);
}
