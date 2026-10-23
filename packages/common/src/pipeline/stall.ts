// Longer than acquire.release's 3 h maxDuration, so a slow album is never taken for a lost task.
export const STALL_MS = 6 * 60 * 60_000;

type Stages = Record<string, { total?: number } | undefined>;

/**
 * A run in acquire whose queue is empty is over, even when its counters are a track short (run 4 sat at 6527 of
 * 6528 for 10 days and blocked spotify.sync, #139). Earlier stages have nothing queued, so they never count as drained.
 */
export function drained(
	stages: Stages,
	left: { inFlight: number; waiting: number },
	acquireStage = "acquire",
): boolean {
	return (
		(stages[acquireStage]?.total ?? 0) > 0 &&
		left.inFlight === 0 &&
		left.waiting === 0
	);
}
