const { app, BrowserWindow } = require("electron");
const { execFile, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Native media helper (SRS PS-12–PS-16): runs the bundled LGPL FFmpeg to
 * make editing proxies, at background priority, on the GPU the user picks.
 * The page streams the source file in, starts a job, then reads the
 * proxy back; it never passes paths, and temp files live in userData.
 */

const EXE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const CHUNK_LIMIT = 64 * 1024 * 1024;

function ffmpegPath() {
	const candidates = [
		path.join(process.resourcesPath ?? "", "ffmpeg", EXE),
		path.join(__dirname, "vendor", "ffmpeg", `${process.platform}-${process.arch}`, EXE),
	];
	return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const tmpDir = () => path.join(app.getPath("userData"), "helper-tmp");
const jobs = new Map(); // id → { input, output, child, size, cancelled }
const queue = [];
let running = 0;
let settings = { concurrency: 1, priority: "background" };
let caps = null;

function run(args, { timeout = 20_000 } = {}) {
	return new Promise((resolve) => {
		const bin = ffmpegPath();
		if (!bin) return resolve({ ok: false, out: "" });
		execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) =>
			resolve({ ok: !error, out: `${stdout}${stderr}` }),
		);
	});
}

// GPU encoders in preference order for "auto"; each is test-encoded once.
const GPU_ENCODERS = {
	nvidia: { encoder: "h264_nvenc", args: ["-preset", "p3"] },
	intel: { encoder: "h264_qsv", args: [] },
	amd: { encoder: "h264_amf", args: [] },
	apple: { encoder: "h264_videotoolbox", args: ["-allow_sw", "1"] },
	windows: { encoder: "h264_mf", args: ["-hw_encoding", "1"] },
	vaapi: { encoder: "h264_vaapi", args: [], vaapi: true },
};
const AUTO_ORDER = {
	darwin: ["apple"],
	win32: ["nvidia", "intel", "amd", "windows"],
	linux: ["nvidia", "intel", "vaapi", "amd"],
};
const CPU = { encoder: "libopenh264", args: ["-allow_skip_frames", "1"] };
const VAAPI_DEVICE = "/dev/dri/renderD128";

async function worksOnThisMachine(spec) {
	const args = ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=10:duration=0.3"];
	if (spec.vaapi) args.push("-vaapi_device", VAAPI_DEVICE, "-vf", "format=nv12,hwupload");
	args.push("-c:v", spec.encoder, ...spec.args, "-f", "null", "-");
	return (await run(args)).ok;
}

async function getCaps() {
	if (caps) return caps;
	const bin = ffmpegPath();
	if (!bin) return (caps = { available: false, reason: "FFmpeg isn't bundled with this build.", gpus: [] });
	const [version, encoders] = await Promise.all([run(["-hide_banner", "-version"]), run(["-hide_banner", "-encoders"])]);
	const listed = (name) => new RegExp(`\\s${name}\\s`).test(encoders.out);
	const gpus = [];
	for (const [id, spec] of Object.entries(GPU_ENCODERS)) {
		if (listed(spec.encoder) && (await worksOnThisMachine(spec))) gpus.push(id);
	}
	const cpu = listed(CPU.encoder) && (await worksOnThisMachine(CPU));
	caps = {
		available: cpu || gpus.length > 0,
		reason: cpu || gpus.length ? null : "No usable H.264 encoder in the bundled FFmpeg.",
		version: version.out.split("\n")[0].replace(/^ffmpeg version\s*/, "").split(" ")[0],
		gpus,
		cpu,
	};
	return caps;
}

async function pickEncoder(gpu) {
	const c = await getCaps();
	if (gpu === "cpu") return c.cpu ? CPU : null;
	if (gpu && gpu !== "auto") return c.gpus.includes(gpu) ? GPU_ENCODERS[gpu] : c.cpu ? CPU : null;
	const preferred = (AUTO_ORDER[process.platform] ?? []).find((id) => c.gpus.includes(id));
	return preferred ? GPU_ENCODERS[preferred] : c.cpu ? CPU : null;
}

function broadcast(channel, payload) {
	for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

function lowerPriority(pid) {
	if (settings.priority !== "background" || !pid) return;
	try {
		os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
	} catch {
		// Not allowed on this system; the job still runs.
	}
}

function proxyArgs({ input, output, height, encoder, hasAudio }) {
	const h = Math.max(144, Math.min(2160, Math.round(height / 2) * 2));
	// Keep the source's exact aspect ratio so clips line up with the original.
	const scale = `scale=-2:${h}:flags=bicubic`;
	const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats"];
	if (encoder.vaapi) args.push("-vaapi_device", VAAPI_DEVICE);
	args.push("-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn");
	args.push("-vf", encoder.vaapi ? `${scale},format=nv12,hwupload` : `${scale},format=yuv420p`);
	args.push("-c:v", encoder.encoder, ...encoder.args);
	// Bitrate by height; a keyframe every second keeps scrubbing fast.
	args.push("-b:v", `${Math.round((h / 540) * 3)}M`, "-force_key_frames", "expr:gte(t,n_forced*1)");
	args.push(...(hasAudio === false ? ["-an"] : ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]));
	args.push("-movflags", "+faststart", "-f", "mp4", output);
	return args;
}

/**
 * FFmpeg filters that turn 360° camera originals into equirectangular video
 * (SRS VR-02, VR-03). `videoTracks` is how many video streams the file has.
 */
function sphereFilter({ layout, height, videoTracks }) {
	const h = Math.max(960, Math.min(2880, Math.round(height / 2) * 2));
	const out = `v360=input=%IN%:output=e:w=${h * 2}:h=${h}:interp=cubic,format=yuv420p,setsar=1`;
	if (layout === "eac") return { graph: `[0:v:0]${out.replace("%IN%", "eac")}[v]` };
	if (layout === "c3x2") return { graph: `[0:v:0]${out.replace("%IN%", "c3x2")}[v]` };
	if (layout === "dfisheye") {
		// Insta360: both lenses side by side in one stream, or one stream per lens.
		const fisheye = out.replace("%IN%", "dfisheye:ih_fov=200:iv_fov=200");
		return videoTracks > 1
			? { graph: `[0:v:0][0:v:1]hstack=inputs=2,${fisheye}[v]` }
			: { graph: `[0:v:0]${fisheye}[v]` };
	}
	if (layout === "gopro") {
		// GoPro MAX: two 4096×1344 streams of three 1344 faces with overlap
		// strips between them; drop the strips and stack into an EAC frame.
		const faces = (i) =>
			`[0:v:${i}]split=3[a${i}][b${i}][c${i}];[a${i}]crop=1344:1344:0:0[l${i}];[b${i}]crop=1344:1344:1376:0[m${i}];[c${i}]crop=1344:1344:2752:0[r${i}];[l${i}][m${i}][r${i}]hstack=inputs=3[row${i}]`;
		return { graph: `${faces(0)};${faces(1)};[row0][row1]vstack=inputs=2,${out.replace("%IN%", "eac")}[v]` };
	}
	throw new Error(`Unknown 360° layout ${layout}`);
}

function sphereArgs({ input, output, layout, height, videoTracks, encoder }) {
	const { graph } = sphereFilter({ layout, height, videoTracks });
	const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats"];
	args.push("-i", input, "-filter_complex", graph, "-map", "[v]", "-map", "0:a:0?", "-sn", "-dn");
	args.push("-c:v", encoder.encoder, ...encoder.args, "-b:v", `${Math.round((height / 1440) * 40)}M`);
	// Keep every audio channel: 4-channel ambisonics stays spatial (VR-21).
	args.push("-c:a", "aac", "-b:a", "384k", "-movflags", "+faststart", "-f", "mp4", output);
	return args;
}

function next() {
	while (running < settings.concurrency && queue.length) {
		const task = queue.shift();
		running++;
		task().finally(() => {
			running--;
			next();
		});
	}
}

function job(id) {
	const j = jobs.get(String(id));
	if (!j) throw new Error("Unknown job");
	return j;
}

module.exports = {
	_sphereArgs: sphereArgs,
	async init() {
		await fs.promises.rm(tmpDir(), { recursive: true, force: true }).catch(() => {});
	},
	getCaps,
	configure(next) {
		settings = {
			concurrency: Math.max(1, Math.min(4, Number(next?.concurrency) || settings.concurrency)),
			priority: next?.priority === "normal" ? "normal" : "background",
		};
		return settings;
	},

	async begin() {
		await fs.promises.mkdir(tmpDir(), { recursive: true });
		const id = crypto.randomUUID();
		const base = path.join(tmpDir(), id);
		jobs.set(id, { input: `${base}.in`, output: `${base}.mp4`, child: null, size: 0, cancelled: false });
		await fs.promises.writeFile(`${base}.in`, Buffer.alloc(0));
		return { jobId: id };
	},

	async write({ jobId, chunk }) {
		const j = job(jobId);
		if (!(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk)) throw new Error("chunk must be binary");
		if (chunk.byteLength > CHUNK_LIMIT) throw new Error("chunk too large");
		await fs.promises.appendFile(j.input, Buffer.from(chunk));
	},

	/** Resolves when the proxy is written; progress goes out as helper:progress. */
	proxy({ jobId, height = 540, gpu = "auto", duration, hasAudio }) {
		const j = job(jobId);
		return new Promise((resolve, reject) => {
			queue.push(async () => {
				if (j.cancelled) return reject(Object.assign(new Error("Cancelled"), { code: "cancelled" }));
				const encoder = await pickEncoder(gpu);
				if (!encoder) return reject(new Error((await getCaps()).reason ?? "No encoder"));
				const run = (enc) =>
					new Promise((done) => {
						const child = spawn(ffmpegPath(), proxyArgs({ input: j.input, output: j.output, height, encoder: enc, hasAudio }), {
							windowsHide: true,
						});
						j.child = child;
						lowerPriority(child.pid);
						let errors = "";
						let buf = "";
						child.stderr.on("data", (d) => (errors = (errors + d).slice(-2000)));
						child.stdout.on("data", (d) => {
							buf += d;
							let nl;
							while ((nl = buf.indexOf("\n")) >= 0) {
								const [key, value] = buf.slice(0, nl).split("=");
								buf = buf.slice(nl + 1);
								if (key === "out_time_us" && duration > 0)
									broadcast("helper:progress", { jobId, progress: Math.min(1, Number(value) / 1e6 / duration) });
							}
						});
						child.on("close", (code) => done({ code, errors }));
						child.on("error", (error) => done({ code: -1, errors: error.message }));
					});
				let used = encoder;
				let result = await run(encoder);
				// A GPU encoder can still fail on a given file (size limits, 4:2:2…): retry on the CPU.
				if (result.code !== 0 && !j.cancelled && encoder !== CPU && (await getCaps()).cpu) {
					used = CPU;
					result = await run(CPU);
				}
				j.child = null;
				if (j.cancelled) return reject(Object.assign(new Error("Cancelled"), { code: "cancelled" }));
				if (result.code !== 0) return reject(new Error(result.errors.trim().split("\n").pop() || `FFmpeg exited with ${result.code}`));
				await fs.promises.rm(j.input, { force: true });
				j.size = (await fs.promises.stat(j.output)).size;
				resolve({ size: j.size, encoder: used.encoder });
			});
			next();
		});
	},

	/** Converts a 360° camera original to equirectangular H.264 (VR-02, VR-03). */
	sphere({ jobId, layout, height = 1920, videoTracks = 1, duration }) {
		const j = job(jobId);
		return new Promise((resolve, reject) => {
			queue.push(async () => {
				if (j.cancelled) return reject(Object.assign(new Error("Cancelled"), { code: "cancelled" }));
				const caps = await getCaps();
				if (!caps.cpu) return reject(new Error(caps.reason ?? "No encoder"));
				let args;
				try {
					args = sphereArgs({ input: j.input, output: j.output, layout, height, videoTracks, encoder: CPU });
				} catch (error) {
					return reject(error);
				}
				const result = await new Promise((done) => {
					const child = spawn(ffmpegPath(), args, { windowsHide: true });
					j.child = child;
					lowerPriority(child.pid);
					let errors = "";
					let buf = "";
					child.stderr.on("data", (d) => (errors = (errors + d).slice(-2000)));
					child.stdout.on("data", (d) => {
						buf += d;
						let nl;
						while ((nl = buf.indexOf("\n")) >= 0) {
							const [key, value] = buf.slice(0, nl).split("=");
							buf = buf.slice(nl + 1);
							if (key === "out_time_us" && duration > 0)
								broadcast("helper:progress", { jobId, progress: Math.min(1, Number(value) / 1e6 / duration) });
						}
					});
					child.on("close", (code) => done({ code, errors }));
					child.on("error", (error) => done({ code: -1, errors: error.message }));
				});
				j.child = null;
				if (j.cancelled) return reject(Object.assign(new Error("Cancelled"), { code: "cancelled" }));
				if (result.code !== 0) return reject(new Error(result.errors.trim().split("\n").pop() || `FFmpeg exited with ${result.code}`));
				await fs.promises.rm(j.input, { force: true });
				j.size = (await fs.promises.stat(j.output)).size;
				resolve({ size: j.size });
			});
			next();
		});
	},

	async read({ jobId, offset = 0, length = 8 * 1024 * 1024 }) {
		const j = job(jobId);
		const len = Math.min(Number(length), CHUNK_LIMIT, Math.max(0, j.size - offset));
		const handle = await fs.promises.open(j.output, "r");
		try {
			const buffer = Buffer.alloc(len);
			await handle.read(buffer, 0, len, Number(offset));
			return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + len);
		} finally {
			await handle.close();
		}
	},

	async release({ jobId }) {
		const j = jobs.get(String(jobId));
		if (!j) return;
		j.cancelled = true;
		j.child?.kill();
		jobs.delete(String(jobId));
		await Promise.all([fs.promises.rm(j.input, { force: true }), fs.promises.rm(j.output, { force: true })]);
	},

	_test: { proxyArgs, ffmpegPath },
};
