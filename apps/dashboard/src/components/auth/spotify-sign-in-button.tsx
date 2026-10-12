"use client";

import { Button, Icons } from "@lyterion/ui";

import { getSiteUrl } from "@/lib/site-url";
import { authClient } from "@/shared/api/auth-client";

export function SpotifySignInButton() {
	return (
		<Button
			onClick={() =>
				authClient.signIn.social({
					provider: "spotify",
					callbackURL: getSiteUrl(),
				})
			}
		>
			<Icons.spotify />
			Continue with Spotify
		</Button>
	);
}
