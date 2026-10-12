"use client";

import { cn, LyterionBrandHeader } from "@lyterion/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/shared/api/auth-client";

const NAV = [
	{ href: "/", label: "overview" },
	{ href: "/library", label: "library" },
	{ href: "/playlists", label: "playlists" },
	{ href: "/review", label: "review" },
	{ href: "/providers", label: "providers" },
	{ href: "/connections", label: "connections" },
] as const;

function isActive(pathname: string, href: string) {
	return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppSidebar({ userName }: { userName: string }) {
	const pathname = usePathname();
	const router = useRouter();

	async function signOut() {
		await authClient.signOut();
		router.replace("/login");
	}

	return (
		<nav
			aria-label="pages"
			className="flex shrink-0 flex-col border-b md:h-svh md:w-48 md:border-r md:border-b-0"
		>
			<div className="flex h-10 items-center px-3">
				<LyterionBrandHeader />
			</div>
			<span className="hidden px-3 pt-2 pb-1 font-mono text-[11px] text-muted-foreground md:block">
				pages
			</span>
			<div className="flex gap-1 px-2 pb-2 md:flex-col md:gap-0 md:pb-0">
				{NAV.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						aria-current={isActive(pathname, item.href) ? "page" : undefined}
						className={cn(
							"flex h-7 items-center px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground",
							"aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
						)}
					>
						{item.label}
					</Link>
				))}
			</div>
			<div className="mt-auto hidden items-center justify-between border-t px-3 py-2 md:flex">
				<span className="truncate font-mono text-muted-foreground text-xs">
					{userName}
				</span>
				<button
					type="button"
					onClick={signOut}
					className="font-mono text-muted-foreground text-xs hover:text-foreground"
				>
					sign out
				</button>
			</div>
		</nav>
	);
}
