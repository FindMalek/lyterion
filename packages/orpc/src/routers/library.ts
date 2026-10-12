import {
	addOverride,
	duplicateGroups,
	libraryPage,
	playlistsOverview,
	providerStats,
	runReport,
} from "@lyterion/common/dashboard";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

const STATUSES = [
	"pending",
	"resolved",
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
};
