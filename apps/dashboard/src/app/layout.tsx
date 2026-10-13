import "@lyterion/ui/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import AppProviders from "@/components/layout/app-providers";
import { getSiteUrl } from "@/lib/site-url";

// Geist for text, Geist Mono for every number, id and path (D-015, D-051).
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

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
		<html
			lang="en"
			suppressHydrationWarning
			className={`${sans.variable} ${mono.variable}`}
		>
			<body className="antialiased">
				<AppProviders>{children}</AppProviders>
			</body>
		</html>
	);
}
