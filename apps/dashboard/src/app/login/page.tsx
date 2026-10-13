import {
	Alert,
	AlertDescription,
	AlertTitle,
	brandTokens,
	Icons,
	LyterionBrandHeader,
} from "@lyterion/ui";
import { redirect } from "next/navigation";

import { SpotifySignInButton } from "@/components/auth/spotify-sign-in-button";
import { serverClient } from "@/shared/api/orpc-server";
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
	// A fresh instance has nobody to sign in yet; claiming it starts with the setup code.
	const status = await serverClient.onboarding.status().catch(() => null);
	if (status && !status.hasOwner) redirect("/onboarding");

	return (
		<div className="flex min-h-svh items-center justify-center bg-background px-4">
			<div className="flex w-full max-w-sm flex-col border">
				<div className="flex flex-col gap-1 border-b p-4">
					<LyterionBrandHeader />
					<p className="text-muted-foreground text-xs">{brandTokens.tagline}</p>
				</div>
				<div className="flex flex-col gap-3 p-4">
					<p className="text-muted-foreground text-xs">
						Owner sign-in. Lyterion only reads your Spotify library; nothing is
						changed there.
					</p>
					{error && (
						<Alert variant="destructive">
							<Icons.alertCircle />
							<AlertTitle>Sign-in refused</AlertTitle>
							<AlertDescription className="font-mono">
								This instance already has an owner, or Spotify rejected the
								login ({Array.isArray(error) ? error[0] : error}).
							</AlertDescription>
						</Alert>
					)}
					<SpotifySignInButton />
				</div>
			</div>
		</div>
	);
}
