const { app, BrowserWindow, dialog } = require("electron");
const { execFile, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const nativeHelper = require("./native-helper");

/**
 * Production exports through the bundled LGPL FFmpeg (SRS EX-15): the page
 * renders each frame and streams raw RGBA here; FFmpeg encodes ProRes
 * 422 HQ (.mov) or FFV1 (.mkv), both 10-bit, into a temp file in userData.
 * Also 10-bit AV1 (SVT-AV1) and HEVC Main10 (the machine's hardware encoder),
 * tagged HLG or PQ for HDR projects (HD-14).
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

// HEVC Main10 needs a hardware encoder: the LGPL FFmpeg has no x265.
const HEVC_ENCODERS = [
	["hevc_videotoolbox", ["-profile:v", "main10", "-q:v", "65"]],
	["hevc_nvenc", ["-profile:v", "main10", "-preset", "p5", "-cq", "24"]],
	["hevc_qsv", ["-profile:v", "main10", "-global_quality", "24"]],
	["hevc_amf", ["-profile:v", "main10", "-quality", "quality"]],
	["hevc_mf", ["-profile:v", "main10"]],
	["hevc_vaapi", ["-profile:v", "main10", "-vaapi_device", "/dev/dri/renderD128", "-vf", "format=p010,hwupload"]],
];

const DELIVERY = {
	av1: {
		ext: ".mp4",
		video: ["-c:v", "libsvtav1", "-preset", "8", "-crf", "30", "-pix_fmt", "yuv420p10le"],
		audio: ["-c:a", "aac", "-b:a", "192k"],
	},
	hevc: {
		ext: ".mp4",
		// Filled in by probe() with the encoder this machine has.
		video: null,
		audio: ["-c:a", "aac", "-b:a", "192k"],
	},
};

const jobs = new Map(); // id → { child, output, audio, done, error, stderr }
const tmpDir = () => path.join(app.getPath("userData"), "master-tmp");

const COLOR = {
	sdr: ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"],
	hlg: ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-color_range", "tv"],
	pq: ["-colorspace", "bt2020nc", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-color_range", "tv"],
};

// ITU-T H.273 codes: BT.709, or BT.2020 with HLG (18) or PQ (16).
const SVT_COLOR = {
	sdr: "color-primaries=1:transfer-characteristics=1:matrix-coefficients=1",
	hlg: "color-primaries=9:transfer-characteristics=18:matrix-coefficients=9",
	pq: "color-primaries=9:transfer-characteristics=16:matrix-coefficients=9",
};

const specFor = (codec) => CODECS[codec] ?? (DELIVERY[codec]?.video ? DELIVERY[codec] : null);

function masterArgs({ width, height, fps, codec, audio, output, hdr, depth }) {
	const spec = specFor(codec);
	const args = [
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "rawvideo", "-pix_fmt", depth === 16 ? "rgba64le" : "rgba", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "pipe:0",
	];
	if (audio) args.push("-i", audio);
	args.push("-map", "0:v");
	if (audio) args.push("-map", "1:a", ...spec.audio, "-shortest");
	const tone = hdr === "hlg" || hdr === "pq" ? hdr : "sdr";
	args.push(
		...spec.video,
		...(codec === "hevc" ? ["-tag:v", "hvc1"] : []),
		// SVT-AV1 only writes colour tags into the stream from its own options.
		...(codec === "av1" ? ["-svtav1-params", SVT_COLOR[tone]] : []),
		...COLOR[tone],
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

/** Encodes a few frames to see whether this FFmpeg and machine can use an encoder. */
function tryEncode(bin, video) {
	return new Promise((resolve) => {
		const args = ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=256x144:rate=24", "-frames:v", "4", ...video, "-f", "null", "-"];
		execFile(bin, args, { timeout: 20000 }, (error) => resolve(!error));
	});
}

let probed = null;
/** Which 10-bit delivery codecs work here (HD-14), checked once. */
function probe() {
	probed ??= (async () => {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) return [];
		const found = [];
		if (await tryEncode(bin, DELIVERY.av1.video)) found.push("av1");
		for (const [name, extra] of HEVC_ENCODERS) {
			const video = ["-c:v", name, ...extra, ...(extra.includes("-vf") ? [] : ["-pix_fmt", "p010le"])];
			if (await tryEncode(bin, video)) {
				DELIVERY.hevc.video = video;
				found.push("hevc");
				break;
			}
		}
		return found;
	})();
	return probed;
}

module.exports = {
	codecs: async () => [...Object.keys(CODECS), ...(await probe())],

	async start({ width, height, fps, codec, audioWav, hdr, depth }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		if (DELIVERY[codec]) await probe();
		if (!specFor(codec)) throw new Error(`Unknown codec ${codec}`);
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const ext = specFor(codec).ext;
		const output = path.join(tmpDir(), `${id}${ext}`);
		let audio = null;
		if (audioWav) {
			audio = path.join(tmpDir(), `${id}.wav`);
			await fs.promises.writeFile(audio, Buffer.from(audioWav));
		}
		const child = spawn(bin, masterArgs({ width, height, fps, codec, audio, output, hdr, depth }), { stdio: ["pipe", "ignore", "pipe"] });
		const job = { child, output, audio, ext, stderr: "", exited: null };
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

	/**
	 * Puts 4-channel ambisonic sound into a finished MP4 (VR-21): browser
	 * encoders stop at stereo, FFmpeg's AAC takes all four channels.
	 */
	async muxAudio({ video, wav }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const inVideo = path.join(tmpDir(), `${id}-v.mp4`);
		const inAudio = path.join(tmpDir(), `${id}.wav`);
		const output = path.join(tmpDir(), `${id}.mp4`);
		await fs.promises.writeFile(inVideo, Buffer.from(video));
		await fs.promises.writeFile(inAudio, Buffer.from(wav));
		try {
			await new Promise((resolve, reject) => {
				const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", inVideo, "-i", inAudio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "512k", "-shortest", output]);
				let err = "";
				child.stderr.on("data", (d) => { err += d; });
				child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `FFmpeg failed (${code})`))));
			});
			const bytes = await fs.promises.readFile(output);
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		} finally {
			for (const f of [inVideo, inAudio, output]) await fs.promises.unlink(f).catch(() => {});
		}
	},

	/** A picture FrameFlow's own decoder can't read, as JPEG via FFmpeg (HE-11). */
	async convertImage({ data }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const input = path.join(tmpDir(), `${id}.heic`);
		const output = path.join(tmpDir(), `${id}.jpg`);
		await fs.promises.writeFile(input, Buffer.from(data));
		try {
			await new Promise((resolve, reject) => {
				const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-frames:v", "1", "-q:v", "2", output]);
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

	/** A PNG frame as a one-frame HEVC MP4, for HEIC export (HE-10). */
	async encodeStill({ data }) {
		const bin = nativeHelper._test.ffmpegPath();
		if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const input = path.join(tmpDir(), `${id}.png`);
		const output = path.join(tmpDir(), `${id}.mp4`);
		await fs.promises.writeFile(input, Buffer.from(data));
		try {
			await new Promise((resolve, reject) => {
				// kvazaar needs sizes in multiples of 8: pad, and the HEIC crops back.
				const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-frames:v", "1", "-vf", "pad=ceil(iw/8)*8:ceil(ih/8)*8", "-c:v", "libkvazaar", "-pix_fmt", "yuv420p", "-kvazaar-params", "preset=medium,qp=20", "-tag:v", "hvc1", output]);
				let err = "";
				child.stderr.on("data", (d) => { err += d; });
				child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split("\n").pop() || `FFmpeg failed (${code})`))));
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
