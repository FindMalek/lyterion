import { checkConnections } from "@lyterion/common";
import {
	CREDENTIAL_KINDS,
	type CredentialKind,
	clearCredentials,
	describeCredentials,
	mergeCredentials,
	rawCredentials,
	resolveConnectionsEnv,
	saveCredentials,
	validateCredentials,
} from "@lyterion/common/credentials";
import { database } from "@lyterion/core";
import { account } from "@lyterion/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../procedures";

const kindInput = z.enum(
	Object.keys(CREDENTIAL_KINDS) as [CredentialKind, ...CredentialKind[]],
);
const valuesInput = z.object({
	kind: kindInput,
	values: z.record(z.string(), z.string().max(4096)),
});

async function spotifyLinked(userId: string) {
	const [row] = await database
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "spotify")))
		.limit(1);
	return !!row;
}

// Merge with what's saved (blank secret = keep) and refuse anything the schema rejects.
async function prepare(kind: CredentialKind, values: Record<string, string>) {
	const { raw: current } = await rawCredentials(kind);
	const merged = mergeCredentials(kind, current, values);
	const valid = validateCredentials(kind, merged);
	if (!valid.ok) throw new ORPCError("BAD_REQUEST", { message: valid.error });
	return merged;
}

async function probe(
	userId: string,
	kind: CredentialKind,
	raw?: Record<string, string>,
) {
	const rows = await checkConnections(
		await resolveConnectionsEnv(
			await spotifyLinked(userId),
			raw ? { kind, raw } : undefined,
		),
	);
	const row = rows.find((r) => r.id === kind);
	if (!row) throw new ORPCError("NOT_FOUND", { message: kind });
	return row;
}

export const connectionsRouter = {
	list: protectedProcedure.handler(async ({ context }) =>
		checkConnections(
			await resolveConnectionsEnv(await spotifyLinked(context.session.user.id)),
		),
	),
	forms: protectedProcedure.handler(() => describeCredentials()),
	test: protectedProcedure
		.input(valuesInput)
		.handler(async ({ input, context }) =>
			probe(
				context.session.user.id,
				input.kind,
				await prepare(input.kind, input.values),
			),
		),
	save: protectedProcedure
		.input(valuesInput)
		.handler(async ({ input, context }) => {
			await saveCredentials(
				input.kind,
				await prepare(input.kind, input.values),
			);
			return probe(context.session.user.id, input.kind);
		}),
	clear: protectedProcedure
		.input(z.object({ kind: kindInput }))
		.handler(async ({ input }) => {
			await clearCredentials(input.kind);
			return { ok: true as const };
		}),
};
