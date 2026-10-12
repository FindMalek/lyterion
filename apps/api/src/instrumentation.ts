import { apiEnv } from "@lyterion/env/presets/api";
import { configure as configureTrigger } from "@trigger.dev/sdk";

export async function register() {
	// The SDK reads unprefixed TRIGGER_* vars, but every secret here is LYTERION_ prefixed.
	if (apiEnv.LYTERION_TRIGGER_SECRET_KEY) {
		configureTrigger({
			accessToken: apiEnv.LYTERION_TRIGGER_SECRET_KEY,
			baseURL: apiEnv.LYTERION_TRIGGER_API_URL,
		});
	}
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	// Printed on every boot until someone owns the instance, so only whoever can read the logs can claim it (#83).
	try {
		const { ensureSetupCode } = await import("@lyterion/common/onboarding");
		const code = await ensureSetupCode();
		if (code)
			console.log(
				`[onboarding] no owner yet. setup code: ${code} (open ${apiEnv.NEXT_PUBLIC_LYTERION_DASHBOARD_URL ?? "the dashboard"}/onboarding)`,
			);
	} catch (err) {
		console.error("[onboarding] could not create the setup code", err);
	}
}
