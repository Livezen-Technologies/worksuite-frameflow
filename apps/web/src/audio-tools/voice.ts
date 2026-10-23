import { fromDb, levellingGain, spectralGate } from "./dsp";

/** Mono mix of a buffer, for analysis. */
export function monoMix(buffer: AudioBuffer): Float32Array {
	const out = new Float32Array(buffer.length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i++)
			out[i]! += (data[i] ?? 0) / buffer.numberOfChannels;
	}
	return out;
}

/**
 * One-switch voice clean-up (SRS AR-15): noise reduction, then voice
 * enhance (rumble cut, less boom, more presence, gentle compression), then
 * loudness levelling to about −16 LUFS with a −1 dB peak limit.
 */
export async function cleanUpVoice(buffer: AudioBuffer): Promise<AudioBuffer> {
	const rate = buffer.sampleRate;
	const channels = buffer.numberOfChannels;
	// 1. Noise reduction, per channel.
	const denoised = new AudioBuffer({
		length: buffer.length,
		numberOfChannels: channels,
		sampleRate: rate,
	});
	for (let c = 0; c < channels; c++)
		denoised.copyToChannel(
			new Float32Array(
				spectralGate({ samples: buffer.getChannelData(c), sampleRate: rate }),
			),
			c,
		);
	// 2. Voice enhance.
	const enhance = new OfflineAudioContext(channels, buffer.length, rate);
	const source = enhance.createBufferSource();
	source.buffer = denoised;
	const highpass = enhance.createBiquadFilter();
	highpass.type = "highpass";
	highpass.frequency.value = 80;
	const boom = enhance.createBiquadFilter();
	boom.type = "peaking";
	boom.frequency.value = 300;
	boom.Q.value = 1;
	boom.gain.value = -2;
	const presence = enhance.createBiquadFilter();
	presence.type = "peaking";
	presence.frequency.value = 3000;
	presence.Q.value = 0.8;
	presence.gain.value = 3;
	const compressor = enhance.createDynamicsCompressor();
	compressor.threshold.value = -24;
	compressor.ratio.value = 3;
	compressor.attack.value = 0.005;
	compressor.release.value = 0.15;
	source
		.connect(highpass)
		.connect(boom)
		.connect(presence)
		.connect(compressor)
		.connect(enhance.destination);
	source.start();
	const enhanced = await enhance.startRendering();
	// 3. Loudness levelling with a peak limiter.
	const gainDb = levellingGain({
		samples: monoMix(enhanced),
		sampleRate: rate,
	});
	const level = new OfflineAudioContext(channels, buffer.length, rate);
	const src = level.createBufferSource();
	src.buffer = enhanced;
	const gain = level.createGain();
	gain.gain.value = fromDb(gainDb);
	const limiter = level.createDynamicsCompressor();
	limiter.threshold.value = -1.5;
	limiter.knee.value = 0;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.001;
	limiter.release.value = 0.1;
	src.connect(gain).connect(limiter).connect(level.destination);
	src.start();
	return level.startRendering();
}
