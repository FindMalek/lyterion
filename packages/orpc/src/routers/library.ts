import {
	addOverride,
	duplicateGroups,
	libraryPage,
	playlistsOverview,
	providerStats,
	runReport,
} from "@lyterion/common/dashboard";
import { StartRunError, triggerTask } from "@lyterion/common/pipeline/start";
import { reconcilePlan } from "@lyterion/common/reconcile";
import { env } from "@lyterion/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

const STATUSES = [
	"pending",
	"resolved",
	"waiting",
	"queued",
	"searching",
	"fetching",
	"verifying",
	"placed",
	"linked",
	"missing",
	"review",
	"skipped",
	"existing",
] as const;

export const libraryRouter = {
	list: protectedProcedure
		.input(
			z.object({
				status: z.enum(STATUSES).optional(),
				search: z.string().trim().max(200).optional(),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(({ input }) => libraryPage(input)),
	duplicates: protectedProcedure.handler(() => duplicateGroups()),
	// Applied on the next identity.resolve (each run, or the daily sync).
	override: protectedProcedure
		.input(
			z.object({
				kind: z.enum(["merge", "split"]),
				trackA: z.string().min(1),
				trackB: z.string().min(1),
			}),
		)
		.handler(async ({ input }) => {
			await addOverride(input.kind, input.trackA, input.trackB);
			return { ok: true as const };
		}),
	playlists: protectedProcedure.handler(() => playlistsOverview()),
	report: protectedProcedure.handler(() => runReport()),
	providers: protectedProcedure.handler(() => providerStats()),
	reconcilePlan: protectedProcedure.handler(() =>
		reconcilePlan({
			musicDir: env.LYTERION_MUSIC_DIR,
			librarySubdir: env.LYTERION_LIBRARY_SUBDIR,
		}),
	),
	reconcile: protectedProcedure
		.input(z.object({ remove: z.boolean().default(false) }))
		.handler(async ({ input }) => {
			try {
				await triggerTask("library.reconcile", input);
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
			return { queued: true as const };
		}),
	lyricsBackfill: protectedProcedure
		.input(z.object({ force: z.boolean().default(false) }))
		.handler(async ({ input }) => {
			try {
				await triggerTask("lyrics.backfill", input);
			} catch (err) {
				if (err instanceof StartRunError)
					throw new ORPCError("PRECONDITION_FAILED", { message: err.message });
				throw err;
			}
			return { queued: true as const };
		}),
};
