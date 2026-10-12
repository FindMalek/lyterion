import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	typedRoutes: true,
	allowedDevOrigins: ["127.0.0.1"],
	serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
	redirects: async () => {
		return [
			{
				source: "/api",
				destination: "/api/rpc/api-reference",
				permanent: true,
			},
		];
	},
};

export default nextConfig;
