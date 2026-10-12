import Link from "next/link";

import { DuplicatesTable } from "@/components/app/duplicates-table";
import { LibraryTable } from "@/components/app/library-table";
import { ReconcilePlan } from "@/components/app/reconcile-plan";
import { PageHeader } from "@/components/shared/page-header";

export default async function LibraryPage({
	searchParams,
}: {
	searchParams: Promise<{ view?: string }>;
}) {
	const { view } = await searchParams;
	const duplicates = view === "duplicates";
	const reconcile = view === "reconcile";
	const tab = (active: boolean) =>
		active ? "" : "text-muted-foreground hover:text-foreground";
	return (
		<>
			<PageHeader
				title="Library"
				description="every recording and the file that holds it"
				actions={
					<div className="flex gap-3 font-mono text-xs">
						<Link href="/library" className={tab(!duplicates && !reconcile)}>
							tracks
						</Link>
						<Link href="/library?view=duplicates" className={tab(duplicates)}>
							duplicates
						</Link>
						<Link href="/library?view=reconcile" className={tab(reconcile)}>
							reconcile
						</Link>
					</div>
				}
			/>
			{duplicates ? (
				<DuplicatesTable />
			) : reconcile ? (
				<ReconcilePlan />
			) : (
				<LibraryTable />
			)}
		</>
	);
}
