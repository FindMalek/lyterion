import { LyterionBrandHeader } from "@lyterion/ui";
import { redirect } from "next/navigation";

import { SpotifySignInButton } from "@/components/auth/spotify-sign-in-button";
import { getServerSession } from "@/shared/api/session.server";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string | string[] }>;
}) {
	const session = await getServerSession();
	const { error } = await searchParams;

	if (session?.user) {
		redirect("/");
	}

	return (
		<div className="flex min-h-svh items-center justify-center bg-background">
			<div className="flex w-80 flex-col gap-4 border p-4">
				<LyterionBrandHeader />
				<p className="text-muted-foreground text-xs">
					Owner sign-in. Lyterion only reads your Spotify library.
				</p>
				{error && (
					<p className="border border-destructive/40 px-2 py-1.5 font-mono text-destructive text-xs">
						sign-in refused: this instance already has an owner, or Spotify
						rejected the login ({Array.isArray(error) ? error[0] : error})
					</p>
				)}
				<SpotifySignInButton />
			</div>
		</div>
	);
}
