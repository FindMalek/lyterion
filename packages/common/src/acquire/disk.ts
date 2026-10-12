import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";

const GB = 1024 ** 3;

export type DiskGuardOptions = {
	musicDir: string;
	stagingDir: string;
	stagingBudgetGb: number;
	minFreeGb: number;
};

async function dirSize(dir: string): Promise<number> {
	let total = 0;
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) total += await dirSize(full);
		else if (entry.isFile()) total += (await stat(full)).size;
	}
	return total;
}

/** null when acquisition may continue, else why it must pause (docs/pipeline.md § Disk guard). */
export async function diskGuard(
	options: DiskGuardOptions,
): Promise<string | null> {
	const fs = await statfs(options.musicDir);
	const freeGb = (fs.bavail * fs.bsize) / GB;
	if (freeGb < options.minFreeGb)
		return `music disk has ${freeGb.toFixed(1)}GB free, floor is ${options.minFreeGb}GB`;
	const stagingGb = (await dirSize(options.stagingDir)) / GB;
	if (stagingGb > options.stagingBudgetGb)
		return `staging holds ${stagingGb.toFixed(1)}GB, budget is ${options.stagingBudgetGb}GB`;
	return null;
}
