import { describe, expect, test } from "bun:test";
import { closeTab, cycleTab, moveTab, openTab, tabForNumber } from "../tabs";

const t = (id: string) => ({ id, name: id.toUpperCase() });

describe("project tabs", () => {
	test("opening a project twice focuses its tab", () => {
		const tabs = openTab({ tabs: [t("a")], tab: { id: "a", name: "Renamed" } });
		expect(tabs).toEqual([{ id: "a", name: "Renamed" }]);
		expect(openTab({ tabs, tab: t("b") }).map((x) => x.id)).toEqual(["a", "b"]);
	});

	test("closing the active tab shows its neighbour", () => {
		const tabs = [t("a"), t("b"), t("c")];
		expect(closeTab({ tabs, id: "b", activeId: "b" }).nextId).toBe("c");
		expect(closeTab({ tabs, id: "c", activeId: "c" }).nextId).toBe("b");
		expect(closeTab({ tabs, id: "a", activeId: "c" }).nextId).toBe("c");
		expect(
			closeTab({ tabs: [t("a")], id: "a", activeId: "a" }).nextId,
		).toBeNull();
	});

	test("reorders, cycles and picks by number", () => {
		const tabs = [t("a"), t("b"), t("c")];
		expect(moveTab({ tabs, from: 0, to: 2 }).map((x) => x.id)).toEqual([
			"b",
			"c",
			"a",
		]);
		expect(cycleTab({ tabs, activeId: "c", step: 1 })).toBe("a");
		expect(cycleTab({ tabs, activeId: "a", step: -1 })).toBe("c");
		expect(tabForNumber({ tabs, n: 2 })).toBe("b");
		expect(tabForNumber({ tabs, n: 9 })).toBe("c");
		expect(tabForNumber({ tabs, n: 5 })).toBeNull();
	});
});
