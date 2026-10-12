import "@lyterion/ui/styles/globals.css";

import type { Metadata, Viewport } from "next";

import AppProviders from "@/components/layout/app-providers";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
	metadataBase: new URL(getSiteUrl()),
	title: {
		default: "Lyterion",
		template: "%s · Lyterion",
	},
	description: "Spotify to Navidrome migration.",
	robots: {
		index: false,
		follow: false,
	},
};

export const viewport: Viewport = {
	themeColor: "#0a0a0a",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="antialiased">
				<AppProviders>{children}</AppProviders>
			</body>
		</html>
	);
}
