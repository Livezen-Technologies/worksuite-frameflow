import { describe, expect, test } from "bun:test";
import { findProtected, parsePatterns } from "../privacy";

describe("protected windows", () => {
	test("matches part of a window title, any case", () => {
		expect(findProtected({ windows: ["Terminal", "Vault — 1password"], patterns: ["1Password", "KeePass"] })).toBe("1Password");
		expect(findProtected({ windows: ["Terminal"], patterns: ["1Password"] })).toBeNull();
		expect(findProtected({ windows: ["anything"], patterns: [" ", ""] })).toBeNull();
	});
	test("parses a comma list", () => {
		expect(parsePatterns(" Bitwarden, ,Signal ")).toEqual(["Bitwarden", "Signal"]);
	});
});
