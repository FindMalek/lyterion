import { createEnv } from "@t3-oss/env-core";
import { baseEnv } from "../base";
import {
	aiModule,
	authModule,
	libraryModule,
	navidromeModule,
	notifyModule,
	providersModule,
	triggerModule,
	urlsModule,
} from "../modules";
import { createServerRuntimeEnv } from "../utils/runtime-env";
import { dbEnv } from "./db";

export const apiEnv = createEnv({
	extends: [dbEnv, baseEnv],
	server: {
		...aiModule.server,
		...authModule.server,
		...libraryModule.server,
		...navidromeModule.server,
		...notifyModule.server,
		...providersModule.server,
		...triggerModule.server,
	},
	client: {
		...urlsModule.client,
	},
	clientPrefix: "NEXT_PUBLIC_",
	runtimeEnv: createServerRuntimeEnv(),
	emptyStringAsUndefined: true,
	skipValidation:
		process.env.SKIP_ENV_VALIDATION === "true" ||
		process.env.NODE_ENV === "test",
});
