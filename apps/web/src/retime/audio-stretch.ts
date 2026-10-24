import { PitchShifter } from "soundtouchjs";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { RetimeConfig } from "@/timeline";
import { getSourceTimeAtClipTime } from "./resolve";
import { type ClipEq, hasEq } from "@/timeline/audio-state";

/** Runs a buffer through the 3-band EQ (and low cut) offline. */
export async function applyEq({ buffer, eq }: { buffer: AudioBuffer; eq: ClipEq }): Promise<AudioBuffer> {
	const context = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
	const source = context.createBufferSource();
	source.buffer = buffer;
	let node: AudioNode = source;
	const add = (type: BiquadFilterType, frequency: number, gain = 0) => {
		const filter = context.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = frequency;
		filter.gain.value = gain;
		if (type === "peaking") filter.Q.value = 0.9;
		node.connect(filter);
		node = filter;
	};
	if (eq.lowCut > 0) add("highpass", eq.lowCut);
	if (eq.low) add("lowshelf", 200, eq.low);
	if (eq.mid) add("peaking", 1200, eq.mid);
	if (eq.high) add("highshelf", 5000, eq.high);
	node.connect(context.destination);
	source.start(0);
	return context.startRendering();
}

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
				trimStart + getSourceTimeAtClipTime({ clipTime, retime });
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
	eq,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime?: RetimeConfig;
	maintainPitch?: boolean;
	/** Voice changer: shift the pitch without changing the speed. */
	pitchSemitones?: number;
	/** Equaliser, applied after speed and pitch. */
	eq?: ClipEq;
}): Promise<AudioBuffer> {
	const rendered = await renderStretched({ audioContext, sourceBuffer, trimStart, clipDuration, retime, maintainPitch, pitchSemitones });
	return eq && hasEq(eq) ? applyEq({ buffer: rendered, eq }) : rendered;
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
