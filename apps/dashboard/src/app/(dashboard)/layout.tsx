import { LyterionBrandHeader } from "@lyterion/ui";
import { redirect } from "next/navigation";

import { getServerSession } from "@/shared/api/session.server";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getServerSession();

	if (!session?.user) {
		redirect("/login");
	}

	return (
		<div className="grid h-svh grid-rows-[auto_1fr]">
			<header className="flex h-9 items-center justify-between border-b px-3">
				<LyterionBrandHeader />
				<span className="font-mono text-muted-foreground text-xs">
					{session.user.name}
				</span>
			</header>
			<main className="overflow-auto">{children}</main>
		</div>
	);
}
