"use client";

import { Button, Icons } from "@lyterion/ui";
import { useState } from "react";

import { env } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";
import { authClient } from "@/shared/api/auth-client";

// Both a returned { error } and a rejected fetch (api down, CORS) must reach the screen, or the button looks dead.
export function SpotifySignInButton({
	callbackPath = "/",
	errorPath = "/login",
}: {
	callbackPath?: string;
	errorPath?: string;
}) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function signIn() {
		setPending(true);
		setError(null);
		const message = await authClient.signIn
			.social({
				provider: "spotify",
				callbackURL: `${getSiteUrl()}${callbackPath}`,
				errorCallbackURL: `${getSiteUrl()}${errorPath}`,
			})
			.then(({ error }) =>
				error
					? `${error.status ?? ""} ${error.message ?? error.statusText ?? "sign-in failed"}`.trim()
					: null,
			)
			.catch(
				() =>
					`api unreachable at ${env.NEXT_PUBLIC_LYTERION_API_URL} (down, or CORS refused this origin)`,
			);
		// On success the browser is already leaving for Spotify, keep the spinner.
		if (message) {
			console.error("[auth] spotify sign-in failed:", message);
			setError(message);
			setPending(false);
		}
	}

	return (
		<>
			<Button isLoading={pending} onClick={signIn}>
				{!pending && <Icons.spotify />}
				Continue with Spotify
			</Button>
			{error && (
				<p className="break-all border border-destructive/40 px-2 py-1.5 font-mono text-destructive text-xs">
					{error}
				</p>
			)}
		</>
	);
}
