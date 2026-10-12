import { OverviewStats } from "@/components/app/overview-stats";
import { RunsTable } from "@/components/app/runs-table";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { PageHeader } from "@/components/shared/page-header";

export default function OverviewPage() {
	return (
		<>
			<PageHeader
				title="Overview"
				description="setup, services and migration runs"
			/>
			<SetupChecklist />
			<OverviewStats />
			<RunsTable />
		</>
	);
}
