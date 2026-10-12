import { createORPCClientUtils } from "@lyterion/orpc/client";
import { env } from "@/lib/env";

// Server-only client, forwards request headers (session cookie included).
const { client } = createORPCClientUtils({
	apiUrl: env.NEXT_PUBLIC_LYTERION_API_URL,
	getHeaders: async () => {
		const { headers } = await import("next/headers");
		return Object.fromEntries(await headers());
	},
});

export { client as serverClient };
