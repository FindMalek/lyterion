import { DataExportImport } from "@/components/app/data-export-import";
import { PlaylistsTable } from "@/components/app/playlists-table";
import { PageHeader } from "@/components/shared/page-header";

export default function PlaylistsPage() {
	return (
		<>
			<PageHeader
				title="Playlists"
				description="every Spotify playlist, rebuilt in Navidrome with its order and cover"
			/>
			<PlaylistsTable />
			<DataExportImport />
		</>
	);
}
