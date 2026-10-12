import Link from "next/link";

import { DuplicatesTable } from "@/components/app/duplicates-table";
import { LibraryTable } from "@/components/app/library-table";
import { PageHeader } from "@/components/shared/page-header";

export default async function LibraryPage({
	searchParams,
}: {
	searchParams: Promise<{ view?: string }>;
}) {
	const { view } = await searchParams;
	const duplicates = view === "duplicates";
	return (
		<>
			<PageHeader
				title="Library"
				description="every recording and the file that holds it"
				actions={
					<div className="flex gap-3 font-mono text-xs">
						<Link
							href="/library"
							className={
								duplicates ? "text-muted-foreground hover:text-foreground" : ""
							}
						>
							tracks
						</Link>
						<Link
							href="/library?view=duplicates"
							className={
								duplicates ? "" : "text-muted-foreground hover:text-foreground"
							}
						>
							duplicates
						</Link>
					</div>
				}
			/>
			{duplicates ? <DuplicatesTable /> : <LibraryTable />}
		</>
	);
}
