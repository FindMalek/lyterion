import type * as React from "react";

// apps/dashboard/src/app/icon.svg without its tile (keep in sync): a block leaving an open corner, "release".
export function Logo(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="4 4 8 8"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<title>Lyterion</title>
			<path d="M4 6h1.5v4.5H10V12H4z" />
			<rect x="8" y="4" width="4" height="4" />
		</svg>
	);
}
