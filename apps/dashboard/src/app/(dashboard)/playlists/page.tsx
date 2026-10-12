import { PlaylistsTable } from "@/components/app/playlists-table";
import { PageHeader } from "@/components/shared/page-header";

export default function PlaylistsPage() {
	return (
		<>
			<PageHeader
				title="Playlists"
				description="m3u8 files written into the library, with sidecar covers"
			/>
			<PlaylistsTable />
		</>
	);
}
