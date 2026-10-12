import { createORPCClientUtils } from "@lyterion/orpc/client";
import { serverApiUrl } from "@/lib/server-api-url";

// Server-only client, forwards request headers (session cookie included).
const { client } = createORPCClientUtils({
	apiUrl: serverApiUrl(),
	getHeaders: async () => {
		const { headers } = await import("next/headers");
		return Object.fromEntries(await headers());
	},
});

export { client as serverClient };
