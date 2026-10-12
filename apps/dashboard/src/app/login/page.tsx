import { LyterionBrandHeader } from "@lyterion/ui";
import { redirect } from "next/navigation";

import { SpotifySignInButton } from "@/components/auth/spotify-sign-in-button";
import { getServerSession } from "@/shared/api/session.server";

export default async function LoginPage() {
	const session = await getServerSession();

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
				<SpotifySignInButton />
			</div>
		</div>
	);
}
