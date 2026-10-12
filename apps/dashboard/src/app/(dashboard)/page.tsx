import { ConnectionsTable } from "@/components/app/connections-table";
import { RunsTable } from "@/components/app/runs-table";
import { PageHeader } from "@/components/shared/page-header";

export default function OverviewPage() {
	return (
		<>
			<PageHeader
				title="Overview"
				description="connections and migration runs"
			/>
			<div className="grid divide-y border-b lg:grid-cols-2 lg:divide-x lg:divide-y-0">
				<ConnectionsTable />
				<RunsTable />
			</div>
		</>
	);
}
