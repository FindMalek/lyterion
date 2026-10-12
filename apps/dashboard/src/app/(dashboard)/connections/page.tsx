import { Suspense } from "react";

import { ConnectionsTable } from "@/components/app/connections-table";
import { PageHeader } from "@/components/shared/page-header";

export default function ConnectionsPage() {
	return (
		<>
			<PageHeader
				title="Connections"
				description="every service lyterion talks to, checked live. credentials are encrypted in the database"
			/>
			<Suspense>
				<ConnectionsTable />
			</Suspense>
		</>
	);
}
