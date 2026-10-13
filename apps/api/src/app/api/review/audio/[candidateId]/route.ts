import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { stagedCandidate } from "@lyterion/common/review";
import { getAuth } from "@lyterion/core";
import { apiEnv } from "@lyterion/env";
import type { NextRequest } from "next/server";

import { getCorsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
	".flac": "audio/flac",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".ogg": "audio/ogg",
	".opus": "audio/ogg",
	".wav": "audio/wav",
};

// Plays a near miss kept in staging for the review queue (#34); Range support lets the player seek.
export async function GET(
	req: NextRequest,
	context: { params: Promise<{ candidateId: string }> },
) {
	// The dashboard is another origin, and a credentialed media request without these is dropped by the browser.
	const cors = await getCorsHeaders(req.headers.get("origin"));
	const session = await (await getAuth()).api.getSession({
		headers: req.headers,
	});
	if (!session)
		return new Response("unauthorized", { status: 401, headers: cors });
	const { candidateId } = await context.params;
	const row = await stagedCandidate(Number(candidateId));
	const staging = path.resolve(apiEnv.LYTERION_STAGING_DIR);
	if (
		!row?.stagedPath ||
		!path.resolve(row.stagedPath).startsWith(staging + path.sep)
	)
		return new Response("not found", { status: 404, headers: cors });
	let size: number;
	try {
		size = (await stat(row.stagedPath)).size;
	} catch {
		return new Response("gone", { status: 410, headers: cors });
	}
	const type =
		TYPES[path.extname(row.stagedPath).toLowerCase()] ??
		"application/octet-stream";
	const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
	const start = range?.[1] ? Number(range[1]) : 0;
	const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
	if (start > end || start >= size)
		return new Response(null, {
			status: 416,
			headers: { ...cors, "Content-Range": `bytes */${size}` },
		});
	const body = Readable.toWeb(
		createReadStream(row.stagedPath, { start, end }),
	) as ReadableStream;
	return new Response(body, {
		status: range ? 206 : 200,
		headers: {
			...cors,
			"Content-Type": type,
			"Content-Length": String(end - start + 1),
			"Accept-Ranges": "bytes",
			"Cache-Control": "private, no-store",
			...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
		},
	});
}

export async function OPTIONS(req: NextRequest) {
	return new Response(null, {
		status: 204,
		headers: await getCorsHeaders(req.headers.get("origin")),
	});
}
