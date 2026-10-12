import { logger, task } from "@trigger.dev/sdk";

import { getCredentials } from "../../credentials/store";
import { requestMissingAlbums } from "../../library/lidarr-request";
import { createLidarrClient } from "../../providers/lidarr";

// Fired when a run's acquire stage ends; Lidarr works on its own schedule and the next run picks the files up.
export const lidarrRequestTask = task({
	id: "lidarr.request",
	queue: { name: "lidarr", concurrencyLimit: 1 },
	maxDuration: 600,
	run: async () => {
		const lidarr = await getCredentials("lidarr");
		if (!lidarr) return { skipped: "lidarr not connected" };
		const result = await requestMissingAlbums(createLidarrClient(lidarr));
		logger.info("lidarr requests", result);
		return result;
	},
});
