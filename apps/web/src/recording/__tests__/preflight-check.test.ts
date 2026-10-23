import { describe, expect, test } from "bun:test";
import { evaluatePreflight } from "../preflight";

const base = { failed: [], video: [], encoderFps: null, encoderNeedFps: 30, diskBytesPerSecond: null, needBytesPerSecond: 1_000_000 };

describe("setup test", () => {
	test("all good", () => {
		const rows = evaluatePreflight({ ...base, video: [{ device: "Camera", wantHeight: 1080, height: 1080, wantFps: 30, measuredFps: 29.6 }], encoderFps: 90, diskBytesPerSecond: 200_000_000 });
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
	});
	test("slow camera, slow encoder, slow disk, missing mic", () => {
		const rows = evaluatePreflight({ ...base, failed: [{ device: "Microphone", reason: "not allowed" }], video: [{ device: "Camera", wantHeight: 1080, height: 720, wantFps: 30, measuredFps: 15 }], encoderFps: 24, diskBytesPerSecond: 3_000_000 });
		expect(rows.map((r) => [r.id, r.status])).toEqual([["devices", "fail"], ["resolution", "warn"], ["frame-rate", "fail"], ["encoder", "fail"], ["disk", "warn"]]);
		expect(rows[2]!.detail).toContain("USB");
		const screen = evaluatePreflight({ ...base, video: [{ device: "Screen", wantHeight: 1080, height: 1080, wantFps: 30, measuredFps: 20, onChange: true }] });
		expect([screen[2]!.status, screen[2]!.detail.includes("still screen")]).toEqual(["ok", true]);
	});
});
