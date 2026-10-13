import { DuplicatesTable } from "@/components/app/duplicates-table";
import { LibraryTable } from "@/components/app/library-table";
import { LyricsBackfillButton } from "@/components/app/lyrics-backfill-button";
import { ReconcilePlan } from "@/components/app/reconcile-plan";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs } from "@/components/shared/page-tabs";

export default async function LibraryPage({
	searchParams,
}: {
	searchParams: Promise<{ view?: string }>;
}) {
	const { view } = await searchParams;
	const duplicates = view === "duplicates";
	const reconcile = view === "reconcile";
	return (
		<>
			<PageHeader
				title="Library"
				description="every recording and the file that holds it"
				actions={<LyricsBackfillButton />}
			>
				<PageTabs
					tabs={[
						{
							href: "/library",
							label: "Tracks",
							active: !duplicates && !reconcile,
						},
						{
							href: "/library?view=duplicates",
							label: "Duplicates",
							active: duplicates,
						},
						{
							href: "/library?view=reconcile",
							label: "Reconcile",
							active: reconcile,
						},
					]}
				/>
			</PageHeader>
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
