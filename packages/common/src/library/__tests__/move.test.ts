import {
	copyFile,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { moveFile } from "../move";

const exdev = () =>
	Object.assign(new Error("EXDEV: cross-device link not permitted"), {
		code: "EXDEV",
	});

async function setup() {
	const dir = await mkdtemp(join(tmpdir(), "move-"));
	const src = join(dir, "staged.flac");
	const dest = join(dir, "Artist - Song.flac");
	await writeFile(src, "audio");
	return { dir, src, dest };
}

describe("moveFile", () => {
	it("renames when both paths are on one mount", async () => {
		const { dir, src, dest } = await setup();
		await moveFile(src, dest);
		expect(await readFile(dest, "utf8")).toBe("audio");
		expect(await readdir(dir)).toEqual(["Artist - Song.flac"]);
	});

	it("copies beside the target and renames when the mounts differ", async () => {
		const { dir, src, dest } = await setup();
		const renames: string[] = [];
		await moveFile(src, dest, {
			copyFile,
			rm,
			// The cross-mount move fails like it does from /staging to /music; the same-folder rename works.
			rename: async (from, to) => {
				renames.push(`${from} -> ${to}`);
				if (from === src) throw exdev();
				return rename(from, to);
			},
		});
		expect(await readFile(dest, "utf8")).toBe("audio");
		expect(await readdir(dir)).toEqual(["Artist - Song.flac"]);
		expect(renames[1]).toBe(`${dest}.tmp -> ${dest}`);
	});

	it("leaves the source and no temp file when the copy fails", async () => {
		const { dir, src, dest } = await setup();
		await expect(
			moveFile(src, dest, {
				rm,
				rename: async () => {
					throw exdev();
				},
				copyFile: async () => {
					throw new Error("ENOSPC: no space left on device");
				},
			}),
		).rejects.toThrow("ENOSPC");
		expect(await readdir(dir)).toEqual(["staged.flac"]);
	});

	it("rethrows anything that isn't a cross-mount move", async () => {
		const { src, dest } = await setup();
		await expect(
			moveFile(src, dest, {
				copyFile,
				rm,
				rename: async () => {
					throw Object.assign(new Error("EACCES"), { code: "EACCES" });
				},
			}),
		).rejects.toThrow("EACCES");
	});
});
