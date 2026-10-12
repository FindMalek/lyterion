import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
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
		<div className="flex min-h-svh flex-col md:h-svh md:flex-row">
			<AppSidebar userName={session.user.name} />
			<main className="min-w-0 flex-1 overflow-auto">{children}</main>
		</div>
	);
}
