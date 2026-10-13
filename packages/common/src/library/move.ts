import { copyFile, rename, rm } from "node:fs/promises";

type Fs = {
	rename: typeof rename;
	copyFile: typeof copyFile;
	rm: typeof rm;
};

/** rename(), or across mounts (staging and the library are separate binds in a run) copy beside the target, then rename. */
export async function moveFile(
	src: string,
	dest: string,
	fs: Fs = { rename, copyFile, rm },
): Promise<void> {
	try {
		await fs.rename(src, dest);
		return;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
	}
	// The .tmp sits in the target folder, so the last rename is atomic and a half copy never shows up in the library.
	const tmp = `${dest}.tmp`;
	try {
		await fs.copyFile(src, tmp);
		await fs.rename(tmp, dest);
	} catch (err) {
		await fs.rm(tmp, { force: true });
		throw err;
	}
	await fs.rm(src, { force: true });
}
