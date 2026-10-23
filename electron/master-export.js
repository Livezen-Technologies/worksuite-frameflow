const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const nativeHelper = require("./native-helper");

/**
 * Production exports through the bundled LGPL FFmpeg (SRS EX-15): the page
 * renders each frame and streams raw RGBA here; FFmpeg encodes ProRes
 * 422 HQ (.mov) or FFV1 (.mkv), both 10-bit, into a temp file in userData.
 * Saving moves it into place (EX-13). Also MP3/M4A audio (EX-12).
 */

const CODECS = {
	prores: {
		ext: ".mov",
		video: ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"],
		audio: ["-c:a", "pcm_s24le"],
	},
	ffv1: {
		ext: ".mkv",
		video: ["-c:v", "ffv1", "-level", "3", "-g", "1", "-slices", "16", "-slicecrc", "1", "-pix_fmt", "yuv444p10le"],
		audio: ["-c:a", "flac"],
	},
};

const jobs = new Map(); // id → { child, output, audio, done, error, stderr }
const tmpDir = () => path.join(app.getPath("userData"), "master-tmp");

function masterArgs({ width, height, fps, codec, audio, output }) {
	const spec = CODECS[codec];
	const args = [
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "pipe:0",
	];
	if (audio) args.push("-i", audio);
	args.push("-map", "0:v");
	if (audio) args.push("-map", "1:a", ...spec.audio, "-shortest");
	args.push(
		...spec.video,
		"-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
		output,
	);
	return args;
}

async function moveInto(from, to) {
	const temp = `${to}.${process.pid}.part`;
	try {
		await fs.promises.copyFile(from, temp);
		const [a, b] = await Promise.all([fs.promises.stat(from), fs.promises.stat(temp)]);
		if (a.size !== b.size) throw new Error("The export file didn't copy completely.");
		await fs.promises.rename(temp, to);
		await fs.promises.unlink(from).catch(() => {});
	} catch (error) {
		await fs.promises.unlink(temp).catch(() => {});
		throw error;
	}
}

module.exports = {
	codecs: () => Object.keys(CODECS),

	async start({ width, height, fps, codec, audioWav }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		if (!CODECS[codec]) throw new Error(`Unknown codec ${codec}`);
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const output = path.join(tmpDir(), `${id}${CODECS[codec].ext}`);
		let audio = null;
		if (audioWav) {
			audio = path.join(tmpDir(), `${id}.wav`);
			await fs.promises.writeFile(audio, Buffer.from(audioWav));
		}
		const child = spawn(bin, masterArgs({ width, height, fps, codec, audio, output }), { stdio: ["pipe", "ignore", "pipe"] });
		const job = { child, output, audio, ext: CODECS[codec].ext, stderr: "", exited: null };
		job.exited = new Promise((resolve) => child.on("close", (code) => resolve(code)));
		child.stderr.on("data", (d) => { job.stderr = (job.stderr + d).slice(-4000); });
		child.stdin.on("error", () => {});
		jobs.set(id, job);
		return { id, ext: job.ext };
	},

	async frame({ id, data }) {
		const job = jobs.get(id);
		if (!job) throw new Error("Export not found");
		if (job.child.exitCode !== null) throw new Error(job.stderr.trim() || "FFmpeg stopped");
		if (!job.child.stdin.write(Buffer.from(data)))
			await new Promise((resolve) => job.child.stdin.once("drain", resolve));
		return true;
	},

	async finish({ id }) {
		const job = jobs.get(id);
		if (!job) throw new Error("Export not found");
		job.child.stdin.end();
		const code = await job.exited;
		if (job.audio) await fs.promises.unlink(job.audio).catch(() => {});
		if (code !== 0) {
			await fs.promises.unlink(job.output).catch(() => {});
			jobs.delete(id);
			throw new Error(job.stderr.trim() || `FFmpeg failed (${code})`);
		}
		const { size } = await fs.promises.stat(job.output);
		return { size };
	},

	async cancel({ id }) {
		const job = jobs.get(id);
		if (!job) return;
		jobs.delete(id);
		job.child.kill("SIGKILL");
		await job.exited;
		await fs.promises.unlink(job.output).catch(() => {});
		if (job.audio) await fs.promises.unlink(job.audio).catch(() => {});
	},

	/** Asks where to save (or saves into Videos/Worksuite) and moves the file there. */
	async save({ id, suggestedName, toFolder = false }) {
		const job = jobs.get(id);
		if (!job) throw new Error("Export not found");
		const folder = path.join(app.getPath("videos"), "Worksuite");
		await fs.promises.mkdir(folder, { recursive: true });
		const name = `${path.basename(String(suggestedName)).replace(/\.[^.]+$/, "")}${job.ext}`;
		let target;
		if (toFolder) {
			const stem = name.slice(0, -job.ext.length);
			target = path.join(folder, name);
			for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${stem} (${n})${job.ext}`);
		} else {
			const [win] = BrowserWindow.getAllWindows();
			const result = await dialog.showSaveDialog(win, {
				defaultPath: path.join(folder, name),
				filters: [{ name: job.ext.slice(1).toUpperCase(), extensions: [job.ext.slice(1)] }],
			});
			if (result.canceled || !result.filePath) return { saved: false };
			target = result.filePath;
		}
		await moveInto(job.output, target);
		jobs.delete(id);
		return { saved: true, path: target };
	},

	/** WAV in, MP3 or M4A (AAC) out, for audio-only export (EX-12). */
	async encodeAudio({ data, format }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const input = path.join(tmpDir(), `${id}.wav`);
		const output = path.join(tmpDir(), `${id}.${format === "mp3" ? "mp3" : "m4a"}`);
		await fs.promises.writeFile(input, Buffer.from(data));
		const codec = format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "aac", "-b:a", "192k"];
		try {
			await new Promise((resolve, reject) => {
				const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, ...codec, output]);
				let err = "";
				child.stderr.on("data", (d) => { err += d; });
				child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `FFmpeg failed (${code})`))));
			});
			const bytes = await fs.promises.readFile(output);
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		} finally {
			await fs.promises.unlink(input).catch(() => {});
			await fs.promises.unlink(output).catch(() => {});
		}
	},

	_test: { masterArgs },
};
