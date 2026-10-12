import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import { apiEnv } from "./presets/api";

export const env = {
	...apiEnv,
	get LYTERION_BETTER_AUTH_URL() {
		return apiEnv.NEXT_PUBLIC_LYTERION_API_URL;
	},
	get LYTERION_CORS_ORIGIN() {
		return (
			apiEnv.NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN ??
			apiEnv.NEXT_PUBLIC_LYTERION_API_URL
		);
	},
} as typeof apiEnv & {
	LYTERION_BETTER_AUTH_URL: string;
	LYTERION_CORS_ORIGIN: string;
};
