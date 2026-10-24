"use client";

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { HdrCanvasSink } from "@/hdr/sink";
import { transferFromColorSpace } from "@/hdr/settings";
import { DEFAULT_TONE_MAP } from "@/hdr/tonemap";
import type { MediaAsset } from "./types";

/**
 * Small frames for the timeline filmstrip. One decoder per video, requests
 * decoded in time order (forward decoding is cheap), frames kept as JPEG
 * object URLs in a capped cache. Requests whose tile scrolled away are
 * dropped before decoding.
 */

const CACHE_LIMIT = 900;
const JPEG_QUALITY = 0.72;

interface Request {
	time: number;
	key: string;
	signal?: AbortSignal;
	resolve: (url: string | null) => void;
}

interface Decoder {
	input: Input;
	frameAt: (time: number) => Promise<CanvasImageSource | null>;
	queue: Request[];
	busy: boolean;
	failed: boolean;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const decoders = new Map<string, Promise<Decoder | null>>();

function remember({ key, url }: { key: string; url: string }) {
	cache.set(key, url);
	while (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		const stale = cache.get(oldest);
		cache.delete(oldest);
		if (stale) URL.revokeObjectURL(stale);
	}
}

async function openDecoder({ asset, height }: { asset: MediaAsset; height: number }): Promise<Decoder | null> {
	const input = new Input({ source: new BlobSource(asset.file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) {
			input.dispose();
			return null;
		}
		const aspect = track.displayWidth / Math.max(1, track.displayHeight);
		const outHeight = Math.max(16, Math.round(height));
		const outWidth = Math.max(16, Math.round(outHeight * aspect));
		const colorSpace = await track.getColorSpace().catch(() => null);
		const transfer = transferFromColorSpace(colorSpace?.transfer);
		let frameAt: Decoder["frameAt"];
		if (transfer === "sdr") {
			const sink = new CanvasSink(track, { width: outWidth, height: outHeight, fit: "cover", poolSize: 1 });
			frameAt = async (time) => (await sink.getCanvas(time))?.canvas ?? null;
		} else {
			// Tone-mapped like the poster frame and the preview (HD-01).
			const sink = new HdrCanvasSink({
				track,
				transfer,
				settings: DEFAULT_TONE_MAP,
				fullRange: colorSpace?.fullRange ?? false,
			});
			frameAt = async (time) => (await sink.getCanvas(time))?.canvas ?? null;
		}
		return { input, frameAt, queue: [], busy: false, failed: false };
	} catch {
		input.dispose();
		return null;
	}
}

let scratch: HTMLCanvasElement | null = null;

async function encode({ source, height }: { source: CanvasImageSource; height: number }): Promise<string | null> {
	const w = "width" in source ? Number(source.width) : 0;
	const h = "height" in source ? Number(source.height) : 0;
	if (!w || !h) return null;
	const outHeight = Math.max(16, Math.round(height));
	const outWidth = Math.max(16, Math.round((outHeight * w) / h));
	scratch ??= document.createElement("canvas");
	scratch.width = outWidth;
	scratch.height = outHeight;
	const context = scratch.getContext("2d");
	if (!context) return null;
	context.drawImage(source, 0, 0, outWidth, outHeight);
	const blob = await new Promise<Blob | null>((resolve) => scratch?.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
	return blob ? URL.createObjectURL(blob) : null;
}

async function drain({ decoder, height }: { decoder: Decoder; height: number }) {
	if (decoder.busy) return;
	decoder.busy = true;
	try {
		while (decoder.queue.length) {
			// Earliest first: the decoder moves forward instead of seeking back.
			decoder.queue.sort((a, b) => a.time - b.time);
			const request = decoder.queue.shift();
			if (!request) break;
			if (request.signal?.aborted) {
				request.resolve(null);
				continue;
			}
			const hit = cache.get(request.key);
			if (hit) {
				request.resolve(hit);
				continue;
			}
			try {
				const frame = await decoder.frameAt(request.time);
				const url = frame ? await encode({ source: frame, height }) : null;
				if (url) remember({ key: request.key, url });
				request.resolve(url);
			} catch {
				request.resolve(null);
			}
		}
	} finally {
		decoder.busy = false;
	}
}

/** The cached frame URL, if it was decoded already. */
export function cachedFilmstripFrame({ assetId, time, height }: { assetId: string; time: number; height: number }) {
	return cache.get(`${assetId}@${Math.round(height)}:${time}`) ?? null;
}

/** A small frame of `asset` at `time` seconds, `height` px tall (device pixels). */
export function filmstripFrame({
	asset,
	time,
	height,
	signal,
}: {
	asset: MediaAsset;
	time: number;
	height: number;
	signal?: AbortSignal;
}): Promise<string | null> {
	const h = Math.round(height);
	const key = `${asset.id}@${h}:${time}`;
	const hit = cache.get(key);
	if (hit) return Promise.resolve(hit);
	const inFlight = pending.get(key);
	if (inFlight) return inFlight;
	const decoderKey = `${asset.id}@${h}`;
	let decoder = decoders.get(decoderKey);
	if (!decoder) {
		decoder = openDecoder({ asset, height: h });
		decoders.set(decoderKey, decoder);
	}
	const promise = decoder.then(
		(d) =>
			new Promise<string | null>((resolve) => {
				if (!d) return resolve(null);
				d.queue.push({ time, key, signal, resolve });
				void drain({ decoder: d, height: h });
			}),
	);
	pending.set(key, promise);
	void promise.finally(() => pending.delete(key));
	return promise;
}

/** Frees a removed video's decoders and frames. */
export function releaseFilmstrip(assetId: string) {
	for (const [key, decoder] of decoders) {
		if (!key.startsWith(`${assetId}@`)) continue;
		decoders.delete(key);
		void decoder.then((d) => d?.input.dispose());
	}
	for (const [key, url] of cache) {
		if (!key.startsWith(`${assetId}@`)) continue;
		cache.delete(key);
		URL.revokeObjectURL(url);
	}
}
