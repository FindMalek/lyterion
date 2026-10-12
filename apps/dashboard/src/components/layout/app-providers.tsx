"use client";

import { Providers } from "@lyterion/ui";

import { queryClient } from "@/shared/api/orpc";

export default function AppProviders({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Providers queryClient={queryClient} toasterPosition="top-center">
			{children}
		</Providers>
	);
}
