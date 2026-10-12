import { env } from "@/lib/env";

// Server code reaches the api over dokploy-network when set; the browser always uses the public url.
export function serverApiUrl(): string {
	return env.LYTERION_API_INTERNAL_URL ?? env.NEXT_PUBLIC_LYTERION_API_URL;
}
