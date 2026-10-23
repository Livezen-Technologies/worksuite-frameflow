import { describe, expect, test } from "bun:test";
import { needsProxy } from "../rules";
import { previewSource, proxyRegistry } from "../registry";

const video = ({
	w,
	h,
	extra = {},
}: {
	w: number;
	h: number;
	extra?: object;
}) => ({
	type: "video" as const,
	width: w,
	height: h,
	...extra,
});

describe("which clips get proxies", () => {
	test("auto: only above 1080p", () => {
		expect(
			needsProxy({
				asset: video({ w: 3840, h: 2160 }),
				mode: "auto",
				height: 540,
			}),
		).toBe(true);
		expect(
			needsProxy({
				asset: video({ w: 1920, h: 1080 }),
				mode: "auto",
				height: 540,
			}),
		).toBe(false);
		expect(
			needsProxy({
				asset: video({ w: 2160, h: 3840 }),
				mode: "auto",
				height: 540,
			}),
		).toBe(true);
	});

	test("always, off, images, HDR and tiny clips", () => {
		expect(
			needsProxy({
				asset: video({ w: 1920, h: 1080 }),
				mode: "always",
				height: 540,
			}),
		).toBe(true);
		expect(
			needsProxy({
				asset: video({ w: 3840, h: 2160 }),
				mode: "off",
				height: 540,
			}),
		).toBe(false);
		expect(
			needsProxy({
				asset: { type: "image" as const, width: 8000, height: 6000 },
				mode: "always",
				height: 540,
			}),
		).toBe(false);
		expect(
			needsProxy({
				asset: video({
					w: 3840,
					h: 2160,
					extra: { color: { transfer: "hlg" as const } },
				}),
				mode: "auto",
				height: 540,
			}),
		).toBe(false);
		expect(
			needsProxy({
				asset: video({ w: 960, h: 540 }),
				mode: "always",
				height: 720,
			}),
		).toBe(false);
	});
});

describe("preview source", () => {
	const original = new File(["o"], "o.mp4");
	const proxy = new File(["p"], "p.mp4");

	test("uses the proxy in the preview only", () => {
		proxyRegistry.clear();
		expect(
			previewSource({ mediaId: "m", file: original, useProxies: true }).file,
		).toBe(original);
		proxyRegistry.set({ mediaId: "m", file: proxy });
		const preview = previewSource({
			mediaId: "m",
			file: original,
			useProxies: true,
		});
		expect(preview.file).toBe(proxy);
		expect(preview.mediaId).toBe("m:proxy");
		// Exports and stills render with useProxies false.
		expect(
			previewSource({ mediaId: "m", file: original, useProxies: false }).file,
		).toBe(original);
	});

	test("the toolbar switch turns proxies off everywhere", () => {
		proxyRegistry.set({ mediaId: "m", file: proxy });
		proxyRegistry.setEnabled(false);
		expect(
			previewSource({ mediaId: "m", file: original, useProxies: true }).file,
		).toBe(original);
		proxyRegistry.setEnabled(true);
		proxyRegistry.clear();
	});
});
