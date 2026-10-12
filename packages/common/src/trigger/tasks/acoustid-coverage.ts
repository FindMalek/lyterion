import { env } from "@lyterion/env/server";
import { logger, task } from "@trigger.dev/sdk";

import { getCredentials } from "../../credentials/store";
import { createAcoustidClient } from "../../verify/acoustid";
import { fingerprint } from "../../verify/audio";
import { audioFiles, measureCoverage, sample } from "../../verify/coverage";

const DEFAULT_SAMPLE = 200;

// Run once by hand from the Trigger.dev dashboard (S7, #21); paced at AcoustID's 3 requests/s, so ~2 minutes.
export const acoustidCoverageTask = task({
	id: "acoustid.coverage",
	maxDuration: 1800,
	run: async (payload: { dir?: string; size?: number } = {}) => {
		const acoustid = await getCredentials("acoustid");
		if (!acoustid) throw new Error("AcoustID is not connected");
		const dir = payload.dir ?? env.LYTERION_SLSKD_DOWNLOADS_DIR;
		const all = await audioFiles(dir);
		const picked = sample(all, payload.size ?? DEFAULT_SAMPLE);
		logger.info("sampling", { dir, found: all.length, picked: picked.length });
		const client = createAcoustidClient(acoustid.apiKey);
		const report = await measureCoverage(picked, {
			fingerprint,
			lookup: (fp) => client.lookup(fp),
		});
		logger.info("acoustid coverage", report);
		return { dir, ...report };
	},
});
