import { createEnv } from "@t3-oss/env-nextjs";
import { clientModule, urlsModule } from "../modules";
import { createNextjsRuntimeEnv } from "../utils/runtime-env";
import { dbEnv } from "./db";

export const dashboardEnv = createEnv({
	extends: [dbEnv],
	server: {},
	client: {
		...clientModule.client,
		...urlsModule.client,
	},
	runtimeEnv: createNextjsRuntimeEnv(),
	emptyStringAsUndefined: true,
	skipValidation:
		process.env.SKIP_ENV_VALIDATION === "true" ||
		process.env.NODE_ENV === "test",
});
