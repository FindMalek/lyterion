"use client";

import { Button, cn, Icons, Slider } from "@lyterion/ui";
import { useEffect, useImperativeHandle, useRef, useState } from "react";

export type AudioPlayerHandle = { toggle: () => void };

type Props = {
	src: string;
	className?: string;
	ref?: React.Ref<AudioPlayerHandle>;
};

function clock(seconds: number) {
	if (!Number.isFinite(seconds)) return "0:00";
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The browser's own <audio controls> ignores the theme; this one is the kit's Button and Slider over a hidden element.
export function AudioPlayer({ src, className, ref }: Props) {
	const audio = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [muted, setMuted] = useState(false);
	const [scrubbing, setScrubbing] = useState<number | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new candidate starts from zero, paused
	useEffect(() => {
		setPlaying(false);
		setLoading(false);
		setFailed(false);
		setTime(0);
		setDuration(0);
	}, [src]);

	async function toggle() {
		const el = audio.current;
		if (!el || failed) return;
		if (!el.paused) return el.pause();
		setLoading(true);
		try {
			await el.play();
		} catch {
			setFailed(true);
		} finally {
			setLoading(false);
		}
	}

	useImperativeHandle(ref, () => ({ toggle }));

	const shown = scrubbing ?? time;

	return (
		<div
			className={cn(
				"flex h-9 min-w-0 items-center gap-2 border bg-background px-1.5",
				className,
			)}
		>
			{/* biome-ignore lint/a11y/useMediaCaption: a music preview has no speech to caption */}
			<audio
				ref={audio}
				src={src}
				preload="metadata"
				crossOrigin="use-credentials"
				muted={muted}
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				onEnded={() => setPlaying(false)}
				onWaiting={() => setLoading(true)}
				onPlaying={() => setLoading(false)}
				onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
				onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
				onDurationChange={(e) => setDuration(e.currentTarget.duration)}
				onError={() => {
					setFailed(true);
					setLoading(false);
				}}
			/>
			<Button
				size="icon-sm"
				variant={playing ? "secondary" : "default"}
				onClick={toggle}
				disabled={failed}
				isLoading={loading && !failed}
				aria-label={playing ? "pause" : "play"}
			>
				{!loading &&
					(playing ? (
						<Icons.pause className="size-3.5" />
					) : (
						<Icons.play className="size-3.5" />
					))}
			</Button>
			{failed ? (
				<span className="truncate font-mono text-[11px] text-destructive">
					preview unavailable: the staged file is gone or unreadable
				</span>
			) : (
				<>
					<span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">
						{clock(shown)}
					</span>
					<Slider
						aria-label="seek"
						min={0}
						max={duration || 1}
						step={0.1}
						value={[shown]}
						disabled={!duration}
						onValueChange={([v]) => setScrubbing(v ?? 0)}
						onValueCommit={([v]) => {
							if (audio.current && v != null) audio.current.currentTime = v;
							setTime(v ?? 0);
							setScrubbing(null);
						}}
						className="min-w-16 flex-1"
					/>
					<span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
						{clock(duration)}
					</span>
					<Button
						size="icon-xs"
						variant="ghost"
						onClick={() => setMuted((m) => !m)}
						aria-label={muted ? "unmute" : "mute"}
						aria-pressed={muted}
					>
						{muted ? <Icons.volumeOff /> : <Icons.volume />}
					</Button>
				</>
			)}
		</div>
	);
}
