import { describe, expect, test } from "bun:test";
import { clipboardText, fitItemsToCanvas, looksLikeSubtitles } from "../fit";
import type { ElementClipboardItem } from "../types";

const item = ({
	params,
	type = "video",
}: {
	params: Record<string, unknown>;
	type?: string;
}): ElementClipboardItem => {
	const fixture: unknown = {
		trackId: "t",
		trackType: "video",
		element: { type, params },
	};
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal fixture
	return fixture as ElementClipboardItem;
};

describe("pasting between project sizes", () => {
	test("positions scale with the frame; other params untouched", () => {
		const [out] = fitItemsToCanvas({
			items: [
				item({
					params: {
						"transform.positionX": 100,
						"transform.positionY": -50,
						"transform.scaleX": 2,
					},
				}),
			],
			from: { width: 1920, height: 1080 },
			to: { width: 1080, height: 1920 },
		});
		expect(out.element.params?.["transform.positionX"]).toBeCloseTo(56.25);
		expect(out.element.params?.["transform.positionY"]).toBeCloseTo(-88.89, 1);
		expect(out.element.params?.["transform.scaleX"]).toBe(2);
	});

	test("same size is a no-op", () => {
		const items = [item({ params: { "transform.positionX": 10 } })];
		expect(
			fitItemsToCanvas({
				items,
				from: { width: 10, height: 10 },
				to: { width: 10, height: 10 },
			}),
		).toBe(items);
	});
});

describe("system clipboard text", () => {
	test("titles copy as their text, other clips as a short label", () => {
		expect(
			clipboardText({
				items: [
					item({ params: { content: "Hello" }, type: "text" }),
					item({ params: { content: "World" }, type: "text" }),
				],
			}),
		).toBe("Hello\nWorld");
		expect(clipboardText({ items: [item({ params: {} }), item({ params: {} })] })).toBe(
			"FrameFlow: 2 clips",
		);
	});

	test("subtitle text is recognised", () => {
		expect(looksLikeSubtitles("1\n00:00:01,000 --> 00:00:02,500\nHi\n")).toBe(
			true,
		);
		expect(looksLikeSubtitles("WEBVTT\n\n00:01.000 --> 00:02.000\nHi")).toBe(
			true,
		);
		expect(looksLikeSubtitles("Just a sentence.")).toBe(false);
	});
});
