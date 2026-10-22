import { describe, expect, test } from "bun:test";
import { bytesPerMinute, minutesOfSpace } from "../preflight";
import { formatDuration, SessionClock } from "../session";
import { buildWav, encodePcm16, peakDb, wavHeader } from "../wav";

describe("wav", () => {
	test("encodes and interleaves 16-bit PCM", () => {
		const pcm = encodePcm16([
			new Float32Array([1, -1]),
			new Float32Array([0, 0.5]),
		]);
		const view = new DataView(pcm.buffer);
		expect(pcm.length).toBe(8);
		expect(view.getInt16(0, true)).toBe(0x7fff);
		expect(view.getInt16(2, true)).toBe(0);
		expect(view.getInt16(4, true)).toBe(-0x8000);
		expect(view.getInt16(6, true)).toBe(Math.round(0.5 * 0x7fff - 0.5));
	});

	test("writes a valid header", () => {
		const header = new DataView(
			wavHeader({ dataBytes: 960, sampleRate: 48000, channelCount: 2 }).buffer,
		);
		expect(header.getUint32(4, true)).toBe(996);
		expect(header.getUint32(24, true)).toBe(48000);
		expect(header.getUint32(28, true)).toBe(192000);
		expect(header.getUint16(32, true)).toBe(4);
	});

	test("skips latency frames across chunks", async () => {
		const chunks = [new Uint8Array(4), new Uint8Array([1, 2, 3, 4, 5, 6])];
		const wav = buildWav({
			chunks,
			sampleRate: 48000,
			channelCount: 1,
			skipFrames: 3,
		});
		const bytes = new Uint8Array(await wav.arrayBuffer());
		expect(bytes.length).toBe(44 + 4);
		expect([...bytes.subarray(44)]).toEqual([3, 4, 5, 6]);
	});

	test("peak level", () => {
		expect(peakDb(new Float32Array([0.5, -1]))).toBe(0);
		expect(peakDb(new Float32Array([0]))).toBe(-Infinity);
	});
});

describe("session clock", () => {
	test("pauses every track together", () => {
		let now = 0;
		const clock = new SessionClock(() => now);
		clock.start();
		now = 5000;
		clock.pause();
		now = 9000;
		expect(clock.elapsed()).toBe(5);
		clock.resume();
		now = 10_000;
		expect(clock.elapsed()).toBe(6);
	});

	test("formats durations", () => {
		expect(formatDuration(65)).toBe("1:05");
		expect(formatDuration(3725)).toBe("1:02:05");
	});
});

describe("preflight", () => {
	test("estimates storage per minute", () => {
		expect(bytesPerMinute({ mode: "voiceover", profile: "standard" })).toBe(
			5_760_000,
		);
		expect(
			bytesPerMinute({ mode: "screen-camera", profile: "standard" }),
		).toBeGreaterThan(bytesPerMinute({ mode: "screen", profile: "standard" }));
		expect(
			minutesOfSpace({ availableBytes: 57_600_000, perMinute: 5_760_000 }),
		).toBe(10);
		expect(minutesOfSpace({ availableBytes: null, perMinute: 1 })).toBeNull();
	});
});
