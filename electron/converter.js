const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const nativeHelper = require("./native-helper");

/**
 * Tools › Video converter: re-encodes a file with the bundled FFmpeg into
 * another format and size. MP4 and MOV use this machine's H.264 encoder (the
 * same one proxies use); WebM uses VP9; audio formats drop the picture.
 */
const FORMATS = {
	mp4: { ext: ".mp4", kind: "h264" },
	mov: { ext: ".mov", kind: "h264" },
	webm: { ext: ".webm", kind: "vp9" },
	gif: { ext: ".gif", kind: "gif" },
	mp3: { ext: ".mp3", kind: "audio", audio: ["-c:a", "libmp3lame", "-q:a", "2"] },
	m4a: { ext: ".m4a", kind: "audio", audio: ["-c:a", "aac", "-b:a", "192k"] },
	wav: { ext: ".wav", kind: "audio", audio: ["-c:a", "pcm_s16le"] },
};

// Video bitrate in Mbit/s at 1080p for each quality; scaled by height.
const QUALITY = { high: 10, medium: 5, small: 2.5 };

const jobs = new Map(); // jobId → child

function uniquePath(folder, name) {
	const ext = path.extname(name);
	const stem = name.slice(0, name.length - ext.length);
	let target = path.join(folder, name);
	for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${stem} (${n})${ext}`);
	return target;
}

async function buildArgs({ input, output, format, height, quality }) {
	const spec = FORMATS[format];
	const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats", "-i", input];
	const scale = height ? `scale=-2:${Math.round(height / 2) * 2}:flags=bicubic` : null;
	if (spec.kind === "audio") return [...args, "-vn", ...spec.audio, output];
	if (spec.kind === "gif") {
		const h = Math.min(height || 480, 720);
		const filter = `fps=12,scale=-2:${Math.round(h / 2) * 2}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
		return [...args, "-filter_complex", filter, "-an", output];
	}
	const mbps = ((QUALITY[quality] ?? QUALITY.medium) * (height || 1080)) / 1080;
	if (spec.kind === "vp9") {
		const vf = scale ? ["-vf", scale] : [];
		return [...args, ...vf, "-c:v", "libvpx-vp9", "-b:v", `${mbps.toFixed(1)}M`, "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "160k", output];
	}
	const encoder = await nativeHelper.pickEncoder("auto");
	if (!encoder) throw new Error("This build has no H.264 encoder that works on this computer. Try WebM.");
	if (encoder.vaapi) args.splice(args.indexOf("-i"), 0, "-vaapi_device", "/dev/dri/renderD128");
	const vf = encoder.vaapi ? `${scale ? `${scale},` : ""}format=nv12,hwupload` : `${scale ? `${scale},` : ""}format=yuv420p`;
	return [
		...args,
		"-map", "0:v:0", "-map", "0:a:0?",
		"-vf", vf,
		"-c:v", encoder.encoder, ...encoder.args,
		"-b:v", `${mbps.toFixed(1)}M`,
		"-c:a", "aac", "-b:a", "192k", "-ac", "2",
		"-movflags", "+faststart",
		output,
	];
}

/** Converts one file; resolves with the saved path. `onProgress` gets 0–1. */
async function convert({ jobId, input, format, height = 0, quality = "medium", durationSeconds = 0, folder, onProgress }) {
	const spec = FORMATS[format];
	if (!spec) throw new Error(`Unknown format ${format}`);
	if (!input || !fs.existsSync(input)) throw new Error("Couldn't find that file.");
	const bin = nativeHelper._test.ffmpegPath();
	if (!bin) throw new Error("FFmpeg isn't bundled with this build.");
	await fs.promises.mkdir(folder, { recursive: true });
	const base = path.basename(input, path.extname(input));
	const output = uniquePath(folder, `${base}${height ? ` ${height}p` : ""}${spec.ext}`);
	const args = await buildArgs({ input, output, format, height: Number(height) || 0, quality });
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { windowsHide: true });
		jobs.set(String(jobId), child);
		let errors = "";
		child.stderr.on("data", (d) => (errors += d.toString()));
		child.stdout.on("data", (d) => {
			const m = /out_time_ms=(\d+)/.exec(d.toString());
			if (m && durationSeconds > 0) onProgress?.(Math.min(0.99, Number(m[1]) / 1e6 / durationSeconds));
		});
		child.on("close", (code, signal) => {
			jobs.delete(String(jobId));
			if (code === 0) return resolve(output);
			fs.promises.rm(output, { force: true }).catch(() => {});
			reject(new Error(signal ? "Cancelled" : errors.trim().split("\n").pop() || `FFmpeg failed (${code})`));
		});
		child.on("error", reject);
	});
}

function cancel(jobId) {
	jobs.get(String(jobId))?.kill();
}

module.exports = { convert, cancel, FORMATS, _test: { buildArgs } };
