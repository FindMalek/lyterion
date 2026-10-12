import { apiEnv } from "@lyterion/env/presets/api";
import { configure as configureTrigger } from "@trigger.dev/sdk";

export function register() {
	// The SDK reads unprefixed TRIGGER_* vars, but every secret here is LYTERION_ prefixed.
	if (apiEnv.LYTERION_TRIGGER_SECRET_KEY) {
		configureTrigger({
			accessToken: apiEnv.LYTERION_TRIGGER_SECRET_KEY,
			baseURL: apiEnv.LYTERION_TRIGGER_API_URL,
		});
	}
}
