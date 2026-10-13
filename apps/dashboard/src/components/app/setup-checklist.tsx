"use client";

import {
	Button,
	Icons,
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
	Progress,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Section } from "@/components/shared/section";
import { isSetUp, REQUIRED_CONNECTIONS } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

const STEPS: Record<string, { title: string; description: string }> = {
	spotify: {
		title: "Sign in with Spotify",
		description: "Lyterion reads your library with your own developer app.",
	},
	navidrome: {
		title: "Connect Navidrome",
		description: "URL, user and password, for scans, playlists and stars.",
	},
	trigger: {
		title: "Connect Trigger.dev",
		description: "Runs the export, search and placement in the background.",
	},
};

// Shown only while something the first migration needs is missing.
export function SetupChecklist() {
	const { data } = useQuery(orpc.connections.list.queryOptions());
	if (!data) return null;
	const needed = [...REQUIRED_CONNECTIONS, "trigger"].flatMap(
		(id) => data.find((row) => row.id === id) ?? [],
	);
	const done = needed.filter(isSetUp);
	if (done.length === needed.length) return null;

	return (
		<Section
			title="Get started"
			count={`${done.length}/${needed.length}`}
			actions={
				<Progress
					value={(done.length / needed.length) * 100}
					className="h-1 w-24"
				/>
			}
		>
			<ItemGroup className="divide-y">
				{needed.map((row) => {
					const ok = isSetUp(row);
					const step = STEPS[row.id] ?? { title: row.label, description: "" };
					return (
						<Item key={row.id} size="sm">
							<ItemMedia>
								{ok ? (
									<Icons.circleCheck className="size-4 text-success" />
								) : (
									<span className="size-4 border border-muted-foreground/40" />
								)}
							</ItemMedia>
							<ItemContent>
								<ItemTitle
									className={ok ? "text-muted-foreground line-through" : ""}
								>
									{step.title}
								</ItemTitle>
								{!ok && <ItemDescription>{step.description}</ItemDescription>}
							</ItemContent>
							{!ok && (
								<ItemActions>
									<Button size="xs" variant="outline" asChild>
										<Link href={`/connections?edit=${row.id}`}>
											Set up
											<Icons.arrowRight />
										</Link>
									</Button>
								</ItemActions>
							)}
						</Item>
					);
				})}
			</ItemGroup>
		</Section>
	);
}
