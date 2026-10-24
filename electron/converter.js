const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const nativeHelper = require("./native-helper");

/**
 * Tools › Video converter (SRS 37.3, CV-01–CV-09) on the bundled LGPL
 * FFmpeg: probe, convert to every target with presets and options, the
 * quick tools (trim, merge, extract audio, GIF, rotate/crop, compress to a
 * size) and repair. Originals are never touched (CV-05): results go next to
 * the original (or a chosen folder) with a suffix when the name is taken.
 */

const FORMATS = {
	"mp4-h264": { ext: ".mp4", kind: "video", codec: "h264" },
	"mp4-hevc": { ext: ".mp4", kind: "video", codec: "hevc" },
	"mov-prores": { ext: ".mov", kind: "video", codec: "prores" },
	"webm-vp9": { ext: ".webm", kind: "video", codec: "vp9" },
	"mkv-copy": { ext: ".mkv", kind: "copy" },
	gif: { ext: ".gif", kind: "gif" },
	webp: { ext: ".webp", kind: "gif" },
	mp3: { ext: ".mp3", kind: "audio", audio: (kbps) => ["-c:a", "libmp3lame", "-b:a", `${kbps}k`] },
	m4a: { ext: ".m4a", kind: "audio", audio: (kbps) => ["-c:a", "aac", "-b:a", `${kbps}k`] },
	wav: { ext: ".wav", kind: "audio", audio: () => ["-c:a", "pcm_s16le"] },
	flac: { ext: ".flac", kind: "audio", audio: () => ["-c:a", "flac"] },
};

// HEVC: hardware where this machine has it, else Kvazaar (software, BSD).
const HEVC_ENCODERS = [
	["hevc_nvenc", ["-preset", "p4"]],
	["hevc_qsv", []],
	["hevc_videotoolbox", ["-allow_sw", "1"]],
	["hevc_amf", []],
	["hevc_vaapi", [], true],
];

const jobs = new Map(); // jobId → child process
const binary = () => nativeHelper._test.ffmpegPath();

function run({ args, durationSeconds = 0, jobId, onProgress }) {
	const bin = binary();
	if (!bin) return Promise.reject(new Error("FFmpeg isn't bundled with this build."));
	return new Promise((resolve, reject) => {
		const child = spawn(bin, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats", ...args], {
			windowsHide: true,
		});
		if (jobId) jobs.set(String(jobId), child);
		let errors = "";
		child.stderr.on("data", (d) => (errors += d.toString()));
		child.stdout.on("data", (d) => {
			const m = /out_time_ms=(\d+)/.exec(d.toString());
			if (m && durationSeconds > 0) onProgress?.(Math.min(0.99, Number(m[1]) / 1e6 / durationSeconds));
		});
		child.on("close", (code, signal) => {
			if (jobId) jobs.delete(String(jobId));
			if (code === 0) return resolve();
			reject(new Error(signal ? "Cancelled" : errors.trim().split("\n").pop() || `FFmpeg failed (${code})`));
		});
		child.on("error", reject);
	});
}

/** Reads a file's streams with `ffmpeg -i` (CV-01). */
function probe(input) {
	const bin = binary();
	if (!bin) return Promise.reject(new Error("FFmpeg isn't bundled with this build."));
	return new Promise((resolve) => {
		const child = spawn(bin, ["-hide_banner", "-i", input], { windowsHide: true });
		let text = "";
		child.stderr.on("data", (d) => (text += d.toString()));
		child.on("close", () => resolve(parseProbe({ text, file: input })));
		child.on("error", () => resolve({ ok: false, problem: "FFmpeg didn't start." }));
	});
}

function parseProbe({ text, file }) {
	const name = path.basename(file);
	let bytes = 0;
	try {
		bytes = fs.statSync(file).size;
	} catch {
		// Gone since it was added.
	}
	if (/moov atom not found|Invalid data found when processing input/i.test(text))
		return { ok: false, bytes, problem: "The file is incomplete or damaged (the camera may have lost power while recording)." };
	const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
	const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
	const video = /Stream #\d+:\d+[^:]*: Video: ([^\n]+)/.exec(text)?.[1] ?? null;
	const audio = /Stream #\d+:\d+[^:]*: Audio: ([^\n]+)/.exec(text)?.[1] ?? null;
	const info = { ok: true, bytes, duration, hasVideo: false, hasAudio: !!audio };
	if (audio) {
		info.audioCodec = audio.split(/[ ,(]/)[0];
		info.sampleRate = Number(/(\d+) Hz/.exec(audio)?.[1] ?? 0);
		info.channels = /stereo/.test(audio) ? 2 : /mono/.test(audio) ? 1 : Number(/(\d+) channels/.exec(audio)?.[1] ?? 2);
	}
	// A cover picture in an audio file is a still, not video.
	if (video && !/\(attached pic\)/.test(video)) {
		const size = /(\d{2,5})x(\d{2,5})/.exec(video);
		info.hasVideo = true;
		info.videoCodec = video.split(/[ ,(]/)[0];
		info.width = size ? Number(size[1]) : 0;
		info.height = size ? Number(size[2]) : 0;
		info.fps = Number(/([\d.]+) fps/.exec(video)?.[1] ?? /([\d.]+) tbr/.exec(video)?.[1] ?? 0);
		info.hdr = /arib-std-b67/.test(video) ? "HLG" : /smpte2084/.test(video) ? "PQ" : null;
		info.tenBit = /(p10|p12)/.test(video);
	}
	// Camera log footage, from the names cameras give their files (CV-01).
	info.camera = /^G[HXSL]\d{6}/i.test(name)
		? "GoPro"
		: /^DJI_/i.test(name)
			? "DJI"
			: /\.insv$|^VID_\d{8}_\d{6}_\d{2}_\d{3}/i.test(name)
				? "Insta360"
				: /^IMG_\d{4}\.MOV$/i.test(name)
					? "iPhone"
					: null;
	return info;
}

function uniqueOutput({ input, folder, suffix, ext }) {
	const dir = folder || path.dirname(input);
	fs.mkdirSync(dir, { recursive: true });
	const stem = path.basename(input, path.extname(input));
	const name = `${stem}${suffix ? ` ${suffix}` : ""}`;
	let target = path.join(dir, `${name}${ext}`);
	for (let n = 2; fs.existsSync(target) || target === input; n++) target = path.join(dir, `${name} (${n})${ext}`);
	return target;
}

function even(n) {
	return Math.max(2, Math.round(n / 2) * 2);
}

/** Video bitrate in kbit/s for a height and a 0–100 quality. */
function bitrateFor({ height, quality }) {
	const at1080 = 2500 + (quality / 100) * 12_000;
	return Math.round((at1080 * Math.max(240, height)) / 1080);
}

async function videoEncoder({ codec, encoder }) {
	if (codec === "hevc") {
		const caps = await nativeHelper.getCaps();
		if (encoder !== "sw" && caps.available) {
			// The H.264 probe found the GPU; its HEVC sibling is listed by the same vendor.
			const vendor = caps.gpus?.[0];
			const pick = { nvidia: 0, intel: 1, apple: 2, amd: 3, vaapi: 4 }[vendor];
			if (pick !== undefined) {
				const [name, args, vaapi] = HEVC_ENCODERS[pick];
				return { encoder: name, args, vaapi: !!vaapi };
			}
		}
		return { encoder: "libkvazaar", args: ["-preset", "fast"] };
	}
	const spec = await nativeHelper.pickEncoder(encoder === "sw" ? "cpu" : "auto");
	if (!spec) throw new Error("This build has no H.264 encoder that works on this computer. Try WebM.");
	return spec;
}

function toneMapFilter() {
	return "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
}

function escapeFilterPath(p) {
	return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Builds the FFmpeg arguments for one conversion (CV-02, CV-03, CV-06).
 * `options`: format, height, fps, quality (0–100), encoder ("auto"|"sw"),
 * toneMap, lut (a .cube path), burnSubtitles, loudnorm, removeAudio,
 * audioKbps, targetBytes (compress to a size), start/end (seconds).
 */
async function convertArgs({ input, output, info, options }) {
	const spec = FORMATS[options.format];
	const args = [];
	if (options.start > 0) args.push("-ss", String(options.start));
	args.push("-i", input);
	if (options.end > 0) args.push("-t", String(options.end - (options.start || 0)));
	const audioFilters = options.loudnorm ? ["loudnorm=I=-14:TP=-1.5:LRA=11"] : [];
	if (options.denoise) audioFilters.unshift("highpass=f=80", "afftdn=nf=-25");
	const af = audioFilters.length ? ["-af", audioFilters.join(",")] : [];

	if (spec.kind === "audio") return [...args, "-vn", ...af, ...spec.audio(options.audioKbps || 192), output];
	if (spec.kind === "copy") return [...args, "-map", "0", "-c", "copy", output];
	if (spec.kind === "gif") {
		const h = even(Math.min(options.height || 480, 720));
		const fps = options.fps || 15;
		const scale = `fps=${fps},scale=-2:${h}:flags=lanczos`;
		if (options.format === "webp") return [...args, "-vf", scale, "-an", "-c:v", "libwebp_anim", "-loop", "0", "-q:v", "70", output];
		return [...args, "-filter_complex", `${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-an", "-loop", "0", output];
	}

	const filters = [];
	if (options.toneMap && info?.hdr) filters.push(toneMapFilter());
	if (options.lut) filters.push(`lut3d=file='${escapeFilterPath(options.lut)}'`);
	if (options.height && info?.height && options.height !== info.height) filters.push(`scale=-2:${even(options.height)}:flags=bicubic`);
	if (options.fps) filters.push(`fps=${options.fps}`);
	if (options.rotate === 90) filters.push("transpose=1");
	if (options.rotate === 180) filters.push("transpose=1,transpose=1");
	if (options.rotate === 270) filters.push("transpose=2");
	if (options.flip === "h") filters.push("hflip");
	if (options.flip === "v") filters.push("vflip");
	if (options.crop) {
		const [w, h] = options.crop.split(":").map(Number);
		filters.push(`crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'`);
	}
	if (options.burnSubtitles) {
		const srt = input.replace(/\.[^.]+$/, ".srt");
		if (fs.existsSync(srt)) filters.push(`subtitles='${escapeFilterPath(srt)}'`);
	}
	const outHeight = options.height || info?.height || 1080;

	let video;
	if (spec.codec === "prores") {
		filters.push("format=yuv422p10le");
		video = ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0"];
	} else if (spec.codec === "vp9") {
		filters.push("format=yuv420p");
		const crf = Math.round(45 - (options.quality / 100) * 30);
		video = ["-c:v", "libvpx-vp9", "-crf", String(crf), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"];
	} else {
		const enc = await videoEncoder({ codec: spec.codec, encoder: options.encoder });
		if (enc.vaapi) args.unshift("-vaapi_device", "/dev/dri/renderD128");
		filters.push(enc.vaapi ? "format=nv12,hwupload" : "format=yuv420p");
		const kbps = options.targetKbps ?? bitrateFor({ height: outHeight, quality: options.quality ?? 70 });
		video = ["-c:v", enc.encoder, ...enc.args, "-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 1.2)}k`, "-bufsize", `${kbps * 2}k`];
	}
	const audio = options.removeAudio
		? ["-an"]
		: spec.codec === "prores"
			? ["-c:a", "pcm_s16le"]
			: spec.codec === "vp9"
				? ["-c:a", "libopus", "-b:a", "160k"]
				: ["-c:a", "aac", "-b:a", `${options.audioKbps || 192}k`, "-ac", "2"];
	return [
		...args,
		"-map", "0:v:0", "-map", "0:a:0?",
		"-vf", filters.join(","),
		...video,
		...af,
		...audio,
		...(spec.ext === ".mp4" || spec.ext === ".mov" ? ["-movflags", "+faststart"] : []),
		output,
	];
}

/** Converts one file; resolves with where the result was saved (CV-04, CV-05). */
async function convert({ jobId, input, options = {}, folder, onProgress }) {
	const spec = FORMATS[options.format];
	if (!spec) throw new Error(`Unknown format ${options.format}`);
	if (!input || !fs.existsSync(input)) throw new Error("Couldn't find that file.");
	const info = await probe(input);
	if (!info.ok) throw new Error(info.problem);
	const output = uniqueOutput({ input, folder, suffix: options.suffix ?? (spec.kind === "audio" ? "" : "converted"), ext: spec.ext });
	const duration = Math.max(0.1, (options.end || info.duration) - (options.start || 0));
	// Compress to a size (CV-03, CV-07): bitrate from the target; one retry if it comes out over.
	if (options.targetBytes && spec.kind === "video") {
		const audioKbps = options.removeAudio ? 0 : 96;
		let kbps = Math.max(150, Math.floor((options.targetBytes * 8 * 0.96) / duration / 1000) - audioKbps);
		for (let attempt = 0; attempt < 2; attempt++) {
			const args = await convertArgs({ input, output, info, options: { ...options, targetKbps: kbps, audioKbps: audioKbps || undefined } });
			await run({ args, durationSeconds: duration, jobId, onProgress });
			const size = fs.statSync(output).size;
			if (size <= options.targetBytes) break;
			kbps = Math.floor(kbps * (options.targetBytes / size) * 0.92);
		}
	} else {
		const args = await convertArgs({ input, output, info, options });
		await run({ args, durationSeconds: duration, jobId, onProgress });
	}
	return { path: output, bytes: fs.statSync(output).size, sourceBytes: info.bytes };
}

/** Trim without re-encoding: cuts land on keyframes (CV-07). */
async function trim({ jobId, input, start, end, folder, onProgress }) {
	const output = uniqueOutput({ input, folder, suffix: "trimmed", ext: path.extname(input) || ".mp4" });
	await run({
		args: ["-ss", String(start), "-i", input, "-t", String(Math.max(0.1, end - start)), "-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero", output],
		durationSeconds: end - start,
		jobId,
		onProgress,
	});
	return { path: output, bytes: fs.statSync(output).size };
}

/** Joins clips: stream copy when they match, else re-encodes to the first clip's size (CV-07). */
async function merge({ jobId, inputs, folder, onProgress }) {
	if (!inputs?.length || inputs.length < 2) throw new Error("Choose two or more clips.");
	const infos = await Promise.all(inputs.map(probe));
	const bad = infos.findIndex((i) => !i.ok);
	if (bad >= 0) throw new Error(`${path.basename(inputs[bad])}: ${infos[bad].problem}`);
	const first = infos[0];
	const total = infos.reduce((n, i) => n + i.duration, 0);
	const same = infos.every(
		(i) => i.videoCodec === first.videoCodec && i.width === first.width && i.height === first.height && i.audioCodec === first.audioCodec,
	);
	const output = uniqueOutput({ input: inputs[0], folder, suffix: "merged", ext: same ? path.extname(inputs[0]) || ".mp4" : ".mp4" });
	if (same) {
		const list = path.join(os.tmpdir(), `frameflow-merge-${Date.now()}.txt`);
		fs.writeFileSync(list, inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
		try {
			await run({ args: ["-f", "concat", "-safe", "0", "-i", list, "-map", "0", "-c", "copy", output], durationSeconds: total, jobId, onProgress });
		} finally {
			fs.rmSync(list, { force: true });
		}
		return { path: output, bytes: fs.statSync(output).size, reencoded: false };
	}
	const w = even(first.width || 1920);
	const h = even(first.height || 1080);
	const enc = await videoEncoder({ codec: "h264", encoder: "auto" });
	const parts = inputs
		.map((_, i) => `[${i}:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${first.fps || 30},format=yuv420p[v${i}];[${i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a${i}]`)
		.join(";");
	const concat = `${inputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${inputs.length}:v=1:a=1[v][a]`;
	const kbps = bitrateFor({ height: h, quality: 75 });
	await run({
		args: [
			...inputs.flatMap((p) => ["-i", p]),
			"-filter_complex", `${parts};${concat}`,
			"-map", "[v]", "-map", "[a]",
			"-c:v", enc.vaapi ? "libopenh264" : enc.encoder, ...(enc.vaapi ? [] : enc.args), "-b:v", `${kbps}k`,
			"-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output,
		],
		durationSeconds: total,
		jobId,
		onProgress,
	});
	return { path: output, bytes: fs.statSync(output).size, reencoded: true };
}

/** Repair (CV-09): rebuilds what can still be read of a damaged file, then saves it. */
async function repair({ jobId, input, folder, onProgress }) {
	const output = uniqueOutput({ input, folder, suffix: "repaired", ext: ".mkv" });
	try {
		await run({
			args: ["-err_detect", "ignore_err", "-fflags", "+genpts+discardcorrupt", "-i", input, "-map", "0", "-c", "copy", "-ignore_unknown", output],
			jobId,
			onProgress,
		});
	} catch (error) {
		throw new Error(
			/moov atom not found/i.test(String(error))
				? "This MP4 stops before its index was written, so no part of it can be read here. A recovery tool that rebuilds the index from a good file of the same camera can help."
				: String(error.message || error),
		);
	}
	const info = await probe(output);
	if (!info.ok || info.duration < 0.5) {
		fs.rmSync(output, { force: true });
		throw new Error("Nothing readable could be recovered from this file.");
	}
	return { path: output, bytes: fs.statSync(output).size, duration: info.duration };
}

function cancel(jobId) {
	jobs.get(String(jobId))?.kill();
}

async function capabilities() {
	const caps = await nativeHelper.getCaps();
	return { available: !!binary(), gpus: caps.gpus ?? [], cpu: !!caps.cpu };
}

module.exports = { probe, convert, trim, merge, repair, cancel, capabilities, FORMATS, _test: { parseProbe, convertArgs, bitrateFor } };
