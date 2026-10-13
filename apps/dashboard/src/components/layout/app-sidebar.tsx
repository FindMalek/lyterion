"use client";

import type { Icon } from "@lyterion/ui";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Icons,
	LyterionBrandHeader,
	Progress,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@lyterion/ui";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { orderedStages, stageLabel } from "@/lib/status";
import { authClient } from "@/shared/api/auth-client";
import { orpc } from "@/shared/api/orpc";

const LIBRARY = [
	{ href: "/", label: "Overview", icon: Icons.dashboard },
	{ href: "/library", label: "Library", icon: Icons.library },
	{ href: "/playlists", label: "Playlists", icon: Icons.playlist },
	{ href: "/review", label: "Review", icon: Icons.inbox },
] as const;

const SYSTEM = [
	{ href: "/providers", label: "Providers", icon: Icons.server },
	{ href: "/connections", label: "Connections", icon: Icons.plug },
] as const;

function isActive(pathname: string, href: string) {
	return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavGroup({
	label,
	items,
	badges,
}: {
	label: string;
	items: readonly { href: Route; label: string; icon: Icon }[];
	badges?: Record<string, number>;
}) {
	const pathname = usePathname();
	const { setOpenMobile } = useSidebar();
	return (
		<SidebarGroup>
			<SidebarGroupLabel className="font-mono text-[11px] uppercase tracking-widest">
				{label}
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map((item) => {
						const badge = badges?.[item.href] ?? 0;
						return (
							<SidebarMenuItem key={item.href}>
								<SidebarMenuButton
									asChild
									isActive={isActive(pathname, item.href)}
									tooltip={badge ? `${item.label} · ${badge}` : item.label}
								>
									<Link href={item.href} onClick={() => setOpenMobile(false)}>
										<item.icon />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
								{badge > 0 && (
									<SidebarMenuBadge
										role="status"
										aria-label={`${badge} waiting`}
										className="bg-warning/15 font-mono text-[11px] text-warning peer-data-active/menu-button:text-warning"
									>
										{badge}
									</SidebarMenuBadge>
								)}
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

// The run going right now, visible from every page: which stage and how far.
function ActiveRun() {
	const { data } = useQuery({
		...orpc.runs.list.queryOptions(),
		refetchInterval: 15_000,
		meta: { silent: true },
	});
	const run = data?.find((r) => r.status === "running");
	if (!run) return null;
	const stages = orderedStages(run.stages);
	const [stage, progress] =
		stages.find(([, p]) => p.done < p.total) ?? stages.at(-1) ?? [];
	const pct =
		progress && progress.total > 0
			? Math.round((progress.done / progress.total) * 100)
			: 0;
	return (
		<Link
			href="/"
			className="flex flex-col gap-1.5 border p-2 text-xs transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
		>
			<span className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5">
					<span className="size-1.5 animate-pulse bg-foreground" />
					run #{run.id}
				</span>
				<span className="font-mono text-muted-foreground">
					{stage ? stageLabel(stage) : "…"}
				</span>
			</span>
			<Progress value={pct} className="h-1" />
			{progress && (
				<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
					{progress.done.toLocaleString()} / {progress.total.toLocaleString()}
				</span>
			)}
		</Link>
	);
}

function UserFooter({ userName }: { userName: string }) {
	const router = useRouter();
	const { theme, setTheme } = useTheme();
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton tooltip={userName}>
							<Icons.user />
							<span className="font-mono">{userName}</span>
							<Icons.selector className="ml-auto" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="start" className="w-56">
						<DropdownMenuLabel className="font-mono text-muted-foreground">
							{userName}
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase tracking-wider">
							Theme
						</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={theme ?? "system"}
							onValueChange={setTheme}
						>
							<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="system">
								System
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={async () => {
								await authClient.signOut();
								router.replace("/login");
							}}
						>
							<Icons.logout />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export function AppSidebar({ userName }: { userName: string }) {
	const review = useQuery({
		...orpc.review.count.queryOptions(),
		refetchInterval: 30_000,
		meta: { silent: true },
	});
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-14 justify-center border-b px-4 group-data-[collapsible=icon]:px-2">
				<Link href="/" aria-label="Lyterion overview">
					<LyterionBrandHeader className="group-data-[collapsible=icon]:[&>span]:hidden" />
				</Link>
			</SidebarHeader>
			<SidebarContent>
				<NavGroup
					label="Library"
					items={LIBRARY}
					badges={{ "/review": review.data ?? 0 }}
				/>
				<NavGroup label="System" items={SYSTEM} />
			</SidebarContent>
			<SidebarFooter className="gap-2">
				<ActiveRun />
				<UserFooter userName={userName} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
