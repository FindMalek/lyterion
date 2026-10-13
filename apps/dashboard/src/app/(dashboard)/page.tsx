import { OverviewStats } from "@/components/app/overview-stats";
import { RunControls } from "@/components/app/run-controls";
import { RunsTable } from "@/components/app/runs-table";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { PageHeader } from "@/components/shared/page-header";

export default function OverviewPage() {
	return (
		<>
			<PageHeader
				title="Overview"
				description="your library, the run going now, and what needs you"
				actions={<RunControls />}
			/>
			<SetupChecklist />
			<OverviewStats />
			<RunsTable />
		</>
	);
}
