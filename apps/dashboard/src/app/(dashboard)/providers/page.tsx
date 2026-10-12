import { ProvidersReport } from "@/components/app/providers-report";
import { PageHeader } from "@/components/shared/page-header";

export default function ProvidersPage() {
	return (
		<>
			<PageHeader
				title="Providers"
				description="where files come from, how often they pass, and what's still missing"
			/>
			<ProvidersReport />
		</>
	);
}
