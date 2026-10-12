import path from "node:path";
import "@lyterion/env/dashboard";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	typedRoutes: true,
	reactCompiler: true,
	allowedDevOrigins: ["127.0.0.1"],
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "i.scdn.co", pathname: "/**" },
			{ protocol: "https", hostname: "mosaic.scdn.co", pathname: "/**" },
		],
	},
};

export default nextConfig;
