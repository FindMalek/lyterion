import { SidebarInset, SidebarProvider } from "@lyterion/ui";
import { cookies } from "next/headers";
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

	// The kit's sidebar remembers expanded/collapsed in this cookie, so the first paint already matches.
	const open = (await cookies()).get("sidebar_state")?.value !== "false";

	return (
		<SidebarProvider defaultOpen={open}>
			<AppSidebar userName={session.user.name} />
			<SidebarInset className="min-w-0">{children}</SidebarInset>
		</SidebarProvider>
	);
}
