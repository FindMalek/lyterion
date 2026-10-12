import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "./routers/index";

export type AppRouterClient = RouterClient<AppRouter>;

export interface CreateORPCClientUtilsOptions {
	/**
	 * Base API URL (e.g. https://api.example.com)
	 * RPC endpoint will be ${apiUrl}/api/rpc
	 */
	apiUrl: string;
	/**
	 * Optional: provide headers for server-side requests (e.g. from next/headers)
	 */
	getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
}

/** RPC client at `${apiUrl}/api/rpc`. Forwards headers server-side when getHeaders is given. */
export function createORPCClientUtils(
	apiUrlOrOptions: string | CreateORPCClientUtilsOptions,
) {
	const options =
		typeof apiUrlOrOptions === "string"
			? { apiUrl: apiUrlOrOptions }
			: apiUrlOrOptions;
	const { apiUrl, getHeaders } = options;
	const baseUrl = `${apiUrl.replace(/\/$/, "")}/api/rpc`;

	const link = new RPCLink({
		url: baseUrl,
		fetch(url, init) {
			return fetch(url, {
				...init,
				credentials: "include",
			});
		},
		headers: async () => {
			const isBrowser =
				typeof (globalThis as { window?: unknown }).window !== "undefined";
			if (isBrowser) {
				return {};
			}
			if (getHeaders) {
				const headers = await Promise.resolve(getHeaders());
				return typeof headers === "object" ? headers : {};
			}
			return {};
		},
	});

	const client = createORPCClient<AppRouterClient>(link);
	return { link, client };
}
