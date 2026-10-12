"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import { Button, Input } from "@lyterion/ui";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SpotifySignInButton } from "@/components/auth/spotify-sign-in-button";
import { orpc } from "@/shared/api/orpc";

import { OnboardingShell, StepError } from "./onboarding-shell";

type Status = Awaited<ReturnType<AppRouterClient["onboarding"]["status"]>>;

const CODE_KEY = "lyterion.setupCode";

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

// Keeps the code across a reload of this tab only; a failed read just asks for it again.
function storedCode(): string {
	try {
		return sessionStorage.getItem(CODE_KEY) ?? "";
	} catch {
		return "";
	}
}

function storeCode(code: string) {
	try {
		sessionStorage.setItem(CODE_KEY, code);
	} catch {}
}

export function OnboardingFlow({ status }: { status: Status }) {
	const [code, setCode] = useState("");
	const [unlocked, setUnlocked] = useState(false);
	const [appSaved, setAppSaved] = useState(status.spotifyApp !== null);
	const signInError = useSearchParams().get("error");

	const step = appSaved ? 2 : unlocked ? 1 : 0;

	return (
		<OnboardingShell step={step}>
			{step === 0 && (
				<CodeStep
					code={code}
					onCode={setCode}
					onUnlocked={() => {
						storeCode(code);
						setUnlocked(true);
					}}
				/>
			)}
			{step === 1 && (
				<SpotifyAppStep
					code={code}
					redirectUri={status.redirectUri}
					onSaved={() => setAppSaved(true)}
				/>
			)}
			{step === 2 && (
				<>
					<p className="text-muted-foreground">
						Sign in with the Spotify account you added to the app's user
						management. The first account to sign in becomes the owner, and
						every later sign-up is refused.
					</p>
					{signInError && (
						<StepError
							message={`sign-in failed (${signInError}). Check that your account is on the app's allowlist and the redirect uri matches.`}
						/>
					)}
					<SpotifySignInButton
						callbackPath="/onboarding/services"
						errorPath="/onboarding"
					/>
					{status.spotifyApp === "env" && (
						<p className="font-mono text-muted-foreground">
							spotify app set by the deploy environment
						</p>
					)}
				</>
			)}
		</OnboardingShell>
	);
}

function CodeStep({
	code,
	onCode,
	onUnlocked,
}: {
	code: string;
	onCode: (code: string) => void;
	onUnlocked: () => void;
}) {
	const verify = useMutation({
		...orpc.onboarding.verifyCode.mutationOptions(),
		onSuccess: onUnlocked,
	});
	useEffect(() => {
		const saved = storedCode();
		if (saved) onCode(saved);
	}, [onCode]);

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				verify.mutate({ code });
			}}
		>
			<p className="text-muted-foreground">
				This instance has no owner yet. The api prints a one-time setup code on
				boot, so only someone who can read its logs can claim it:
			</p>
			<pre className="overflow-x-auto border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
				[onboarding] no owner yet. setup code: XXXX-XXXX-XXXX
			</pre>
			<div className="flex gap-2">
				<Input
					value={code}
					onChange={(e) => onCode(e.target.value)}
					placeholder="XXXX-XXXX-XXXX"
					autoComplete="off"
					spellCheck={false}
					autoFocus
					className="h-7 font-mono text-xs uppercase"
				/>
				<Button
					type="submit"
					size="sm"
					isLoading={verify.isPending}
					disabled={!code.trim()}
				>
					continue
				</Button>
			</div>
			<StepError message={verify.error ? errorMessage(verify.error) : null} />
		</form>
	);
}

function CopyField({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex min-w-0 items-center border">
			<code className="min-w-0 flex-1 truncate px-2 py-1 font-mono text-[11px]">
				{value}
			</code>
			<button
				type="button"
				className="h-full shrink-0 border-l px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(value);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					} catch {}
				}}
			>
				{copied ? "copied" : "copy"}
			</button>
		</div>
	);
}

function SpotifyAppStep({
	code,
	redirectUri,
	onSaved,
}: {
	code: string;
	redirectUri: string;
	onSaved: () => void;
}) {
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const save = useMutation({
		...orpc.onboarding.saveSpotifyApp.mutationOptions(),
		onSuccess: onSaved,
	});

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate({ code, clientId, clientSecret });
			}}
		>
			<p className="text-muted-foreground">
				Lyterion reads your library through your own Spotify developer app, in
				development mode. The account that owns the app needs Premium.
			</p>
			<ol className="flex flex-col divide-y border">
				<li className="flex flex-col gap-1 px-2 py-2">
					<span>
						<span className="font-mono text-muted-foreground">1 </span>
						Create an app at{" "}
						<a
							href="https://developer.spotify.com/dashboard/create"
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2"
						>
							developer.spotify.com/dashboard
						</a>
						, with <span className="font-mono">Web API</span> checked.
					</span>
				</li>
				<li className="flex flex-col gap-1 px-2 py-2">
					<span>
						<span className="font-mono text-muted-foreground">2 </span>
						Add this redirect uri, exactly:
					</span>
					<CopyField value={redirectUri} />
				</li>
				<li className="px-2 py-2">
					<span className="font-mono text-muted-foreground">3 </span>
					In the app's settings → User Management, add the name and email of
					your Spotify account.
				</li>
				<li className="px-2 py-2">
					<span className="font-mono text-muted-foreground">4 </span>
					Copy the client id and client secret from the app's settings.
				</li>
			</ol>
			<div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
				<label
					htmlFor="spotify-client-id"
					className="font-mono text-muted-foreground"
				>
					client id
				</label>
				<Input
					id="spotify-client-id"
					value={clientId}
					onChange={(e) => setClientId(e.target.value)}
					autoComplete="off"
					spellCheck={false}
					className="h-7 font-mono text-xs"
				/>
				<label
					htmlFor="spotify-client-secret"
					className="font-mono text-muted-foreground"
				>
					client secret
				</label>
				<Input
					id="spotify-client-secret"
					type="password"
					value={clientSecret}
					onChange={(e) => setClientSecret(e.target.value)}
					autoComplete="off"
					spellCheck={false}
					className="h-7 font-mono text-xs"
				/>
			</div>
			<div className="flex items-center gap-2">
				<Button
					type="submit"
					size="sm"
					isLoading={save.isPending}
					disabled={!clientId.trim() || !clientSecret.trim()}
				>
					check and save
				</Button>
				<span className="text-muted-foreground">
					checked with a client credentials token before saving
				</span>
			</div>
			<StepError message={save.error ? errorMessage(save.error) : null} />
		</form>
	);
}
