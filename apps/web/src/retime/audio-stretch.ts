import { PitchShifter } from "soundtouchjs";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { RetimeConfig } from "@/timeline";
import { getSourceTimeAtClipTime } from "./resolve";
import { type ClipFx, hasFx } from "@/timeline/audio-fx";
import { applyFx } from "./audio-fx-render";

const RATE_EPSILON = 1e-6;

function sampleLinear({
	channelData,
	position,
}: {
	channelData: Float32Array;
	position: number;
}): number {
	if (position <= 0) {
		return channelData[0] ?? 0;
	}
	const lower = Math.floor(position);
	const upper = Math.min(channelData.length - 1, lower + 1);
	if (lower >= channelData.length) {
		return 0;
	}
	const fraction = position - lower;
	return channelData[lower] * (1 - fraction) + channelData[upper] * fraction;
}

function buildResampledBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	targetSampleRate,
	retime,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	targetSampleRate: number;
	retime?: RetimeConfig;
}): AudioBuffer {
	const outputLength = Math.max(1, Math.ceil(clipDuration * targetSampleRate));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));
	const outputBuffer = audioContext.createBuffer(
		numChannels,
		outputLength,
		targetSampleRate,
	);

	for (let channel = 0; channel < numChannels; channel++) {
		const sourceData = sourceBuffer.getChannelData(
			Math.min(channel, sourceBuffer.numberOfChannels - 1),
		);
		const outputData = outputBuffer.getChannelData(channel);

		for (let i = 0; i < outputLength; i++) {
			const clipTime = i / targetSampleRate;
			const sourceTime =
				trimStart + getSourceTimeAtClipTime({ clipTime, retime, duration: clipDuration });
			outputData[i] = sampleLinear({
				channelData: sourceData,
				position: sourceTime * sourceBuffer.sampleRate,
			});
		}
	}

	return outputBuffer;
}

async function buildPitchPreservedBuffer({
	sourceBuffer,
	trimStart,
	clipDuration,
	rate,
	targetSampleRate,
	pitchSemitones = 0,
}: {
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	rate: number;
	targetSampleRate: number;
	pitchSemitones?: number;
}): Promise<AudioBuffer> {
	const nativeSampleRate = sourceBuffer.sampleRate;
	const sourceDuration = clipDuration * rate;
	const startSample = Math.max(0, Math.floor(trimStart * nativeSampleRate));
	const numSourceSamples = Math.max(
		1,
		Math.ceil(sourceDuration * nativeSampleRate),
	);
	const available = Math.max(0, sourceBuffer.length - startSample);
	const actualSamples = Math.max(1, Math.min(numSourceSamples, available));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));

	// Resample to targetSampleRate first — soundtouchjs reads raw channel data
	// and does not respect the source buffer's native sample rate.
	const resampledLength = Math.max(
		1,
		Math.ceil(sourceDuration * targetSampleRate),
	);
	const resampleCtx = new OfflineAudioContext(
		numChannels,
		resampledLength,
		targetSampleRate,
	);
	const nativeBuffer = resampleCtx.createBuffer(
		numChannels,
		actualSamples,
		nativeSampleRate,
	);

	for (let ch = 0; ch < numChannels; ch++) {
		const src = sourceBuffer.getChannelData(
			Math.min(ch, sourceBuffer.numberOfChannels - 1),
		);
		nativeBuffer.copyToChannel(
			src.subarray(startSample, startSample + actualSamples),
			ch,
		);
	}

	const resampleSourceNode = resampleCtx.createBufferSource();
	resampleSourceNode.buffer = nativeBuffer;
	resampleSourceNode.connect(resampleCtx.destination);
	resampleSourceNode.start(0);
	const resampledBuffer = await resampleCtx.startRendering();

	const outputSamples = Math.max(
		1,
		Math.ceil(clipDuration * targetSampleRate),
	);
	const stretchCtx = new OfflineAudioContext(
		numChannels,
		outputSamples,
		targetSampleRate,
	);
	const shifter = new PitchShifter(stretchCtx, resampledBuffer, 4096);
	shifter.tempo = rate;
	shifter.pitch = 2 ** (pitchSemitones / 12);
	shifter.connect(stretchCtx.destination);
	return stretchCtx.startRendering();
}

export async function renderRetimedBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	retime,
	maintainPitch = false,
	pitchSemitones = 0,
	fx,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime?: RetimeConfig;
	maintainPitch?: boolean;
	/** Voice changer: shift the pitch without changing the speed. */
	pitchSemitones?: number;
	/** EQ, clean-up and dynamics, applied after speed and pitch. */
	fx?: ClipFx;
}): Promise<AudioBuffer> {
	const rendered = await renderStretched({ audioContext, sourceBuffer, trimStart, clipDuration, retime, maintainPitch, pitchSemitones });
	return fx && hasFx(fx) ? applyFx({ buffer: rendered, fx }) : rendered;
}

async function renderStretched({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	retime,
	maintainPitch,
	pitchSemitones,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime?: RetimeConfig;
	maintainPitch: boolean;
	pitchSemitones: number;
}): Promise<AudioBuffer> {
	const targetSampleRate = audioContext.sampleRate;
	const rate = clampRetimeRate({ rate: retime?.rate ?? 1 });
	if (retime?.curve?.length && (maintainPitch || pitchSemitones !== 0)) {
		return buildCurvePitchPreservedBuffer({
			audioContext,
			sourceBuffer,
			trimStart,
			clipDuration,
			retime,
			targetSampleRate,
			pitchSemitones,
		});
	}
	const usePitchPreservation =
		shouldMaintainPitch({ rate, maintainPitch }) &&
		Math.abs(rate - 1) > RATE_EPSILON;

	if (usePitchPreservation || pitchSemitones !== 0) {
		return buildPitchPreservedBuffer({
			sourceBuffer,
			trimStart,
			clipDuration,
			rate,
			targetSampleRate,
			pitchSemitones,
		});
	}

	return buildResampledBuffer({
		audioContext,
		sourceBuffer,
		trimStart,
		clipDuration,
		targetSampleRate,
		retime,
	});
}

/** Clip seconds per block when keeping pitch through a speed curve. */
const CURVE_BLOCK_SECONDS = 0.25;
const CURVE_FADE_SECONDS = 0.02;

/**
 * Keeps pitch through a speed curve: the clip is stretched in short blocks,
 * each at its own steady speed, and the blocks are cross-faded together.
 */
async function buildCurvePitchPreservedBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	retime,
	targetSampleRate,
	pitchSemitones,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime: RetimeConfig;
	targetSampleRate: number;
	pitchSemitones: number;
}): Promise<AudioBuffer> {
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));
	const outputLength = Math.max(1, Math.ceil(clipDuration * targetSampleRate));
	const output = audioContext.createBuffer(numChannels, outputLength, targetSampleRate);
	const fade = Math.round(CURVE_FADE_SECONDS * targetSampleRate);
	const blocks = Math.max(1, Math.ceil(clipDuration / CURVE_BLOCK_SECONDS));
	const sourceAt = (clipTime: number) =>
		getSourceTimeAtClipTime({ clipTime, retime, duration: clipDuration });
	for (let b = 0; b < blocks; b++) {
		const start = b * CURVE_BLOCK_SECONDS;
		const end = Math.min(clipDuration, start + CURVE_BLOCK_SECONDS);
		// Render a little extra so neighbouring blocks overlap for the fade.
		const renderEnd = Math.min(clipDuration, end + CURVE_FADE_SECONDS);
		const length = renderEnd - start;
		if (length <= 0) continue;
		const sourceStart = sourceAt(start);
		const blockRate = clampRetimeRate({ rate: (sourceAt(renderEnd) - sourceStart) / length });
		const rendered = await buildPitchPreservedBuffer({
			sourceBuffer,
			trimStart: trimStart + sourceStart,
			clipDuration: length,
			rate: blockRate,
			targetSampleRate,
			pitchSemitones,
		});
		const offset = Math.round(start * targetSampleRate);
		for (let ch = 0; ch < numChannels; ch++) {
			const out = output.getChannelData(ch);
			const data = rendered.getChannelData(Math.min(ch, rendered.numberOfChannels - 1));
			for (let i = 0; i < data.length && offset + i < outputLength; i++) {
				// Fade in over the previous block's tail; the tail fades out below.
				const fadeIn = b > 0 && i < fade ? i / fade : 1;
				const tailStart = Math.round((end - start) * targetSampleRate);
				const fadeOut = i >= tailStart ? Math.max(0, 1 - (i - tailStart) / fade) : 1;
				out[offset + i] += data[i] * fadeIn * fadeOut;
			}
		}
	}
	return output;
}
