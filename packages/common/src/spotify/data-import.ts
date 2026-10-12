import { db } from "@lyterion/db";
import { dataImport } from "@lyterion/db/schema/spotify";
import { desc } from "drizzle-orm";

import { parseDataExport } from "./data-export";

export async function storeDataExport(files: Record<string, string>) {
	const parsed = parseDataExport(files);
	const [row] = await db
		.insert(dataImport)
		.values({ payload: parsed })
		.returning({ id: dataImport.id });
	return {
		importId: row?.id ?? 0,
		playlists: parsed.playlists.length,
		items: parsed.playlists.reduce((n, p) => n + p.items.length, 0),
		liked: parsed.likedTrackIds.length,
	};
}

export async function recentImports() {
	return db
		.select({
			id: dataImport.id,
			status: dataImport.status,
			summary: dataImport.summary,
			uploadedAt: dataImport.uploadedAt,
		})
		.from(dataImport)
		.orderBy(desc(dataImport.uploadedAt))
		.limit(5);
}
