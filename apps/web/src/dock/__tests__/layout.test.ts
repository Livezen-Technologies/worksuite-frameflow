import { describe, expect, test } from "bun:test";
import {
	DEFAULT_DOCK,
	type DockPanelId,
	closePanel,
	dockPanel,
	findPanel,
	reopenPanel,
	sanitizeDock,
	showTab,
	zoneAt,
} from "../layout";

const ids = (layout: typeof DEFAULT_DOCK) => ({
	top: layout.top.map((s) => s.panels.join("+")),
	bottom: layout.bottom.map((s) => s.panels.join("+")),
	hidden: layout.hidden,
});

describe("docking panels", () => {
	test("dock beside another panel", () => {
		const l = dockPanel({ layout: DEFAULT_DOCK, id: "properties", target: { row: "top", index: 0 }, zone: "left" });
		expect(ids(l)).toEqual({ top: ["properties", "media", "preview"], bottom: ["timeline"], hidden: [] });
	});

	test("dock as a tab, and pick tabs", () => {
		const l = dockPanel({ layout: DEFAULT_DOCK, id: "properties", target: { row: "top", index: 0 }, zone: "center" });
		expect(ids(l).top).toEqual(["media+properties", "preview"]);
		expect(l.top[0].active).toBe("properties");
		expect(showTab({ layout: l, id: "media" }).top[0].active).toBe("media");
	});

	test("dock into the other row", () => {
		const down = dockPanel({ layout: DEFAULT_DOCK, id: "media", target: { row: "bottom", index: 0 }, zone: "right" });
		expect(ids(down)).toEqual({ top: ["preview", "properties"], bottom: ["timeline", "media"], hidden: [] });
		const up = dockPanel({ layout: DEFAULT_DOCK, id: "timeline", target: { row: "top", index: 1 }, zone: "bottom" });
		expect(ids(up)).toEqual({ top: ["media", "preview", "properties"], bottom: ["timeline"], hidden: [] });
		const below = dockPanel({ layout: DEFAULT_DOCK, id: "properties", target: { row: "top", index: 1 }, zone: "bottom" });
		expect(ids(below)).toEqual({ top: ["media", "preview"], bottom: ["timeline", "properties"], hidden: [] });
		const above = dockPanel({ layout: DEFAULT_DOCK, id: "timeline", target: { row: "top", index: 1 }, zone: "top" });
		expect(ids(above)).toEqual({ top: ["media", "timeline", "preview", "properties"], bottom: [], hidden: [] });
	});

	test("dropping a panel on itself changes nothing", () => {
		expect(dockPanel({ layout: DEFAULT_DOCK, id: "preview", target: { row: "top", index: 1 }, zone: "left" })).toBe(DEFAULT_DOCK);
	});

	test("close and reopen in its usual place", () => {
		const closed = closePanel({ layout: DEFAULT_DOCK, id: "media" });
		expect(ids(closed)).toEqual({ top: ["preview", "properties"], bottom: ["timeline"], hidden: ["media"] });
		expect(findPanel({ layout: closed, id: "media" })).toBeNull();
		expect(reopenPanel({ layout: closed, id: "media" })).toEqual(DEFAULT_DOCK);
		const rest: DockPanelId[] = ["media", "preview", "properties"];
		const last = rest.reduce(
			(l, id) => closePanel({ layout: l, id }),
			closePanel({ layout: DEFAULT_DOCK, id: "timeline" }),
		);
		expect(ids(last).top.length + ids(last).bottom.length).toBe(1);
	});

	test("zones: edges dock beside, the middle as a tab", () => {
		const box = { width: 100, height: 100 };
		expect(zoneAt({ x: 5, y: 50, ...box })).toBe("left");
		expect(zoneAt({ x: 95, y: 50, ...box })).toBe("right");
		expect(zoneAt({ x: 50, y: 5, ...box })).toBe("top");
		expect(zoneAt({ x: 50, y: 95, ...box })).toBe("bottom");
		expect(zoneAt({ x: 50, y: 50, ...box })).toBe("center");
	});

	test("a broken save becomes a valid layout", () => {
		expect(sanitizeDock(null)).toEqual(DEFAULT_DOCK);
		const fixed = sanitizeDock({ top: [{ panels: ["preview", "preview", "nope"], active: "x" }], bottom: [] });
		expect(ids(fixed)).toEqual({ top: ["preview"], bottom: [], hidden: ["media", "properties", "timeline"] });
	});
});
