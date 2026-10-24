import type { ClipFx } from "@/timeline/audio-fx";

/**
 * Renders a clip's effects offline: low cut and EQ, parametric bands,
 * presence, then noise/echo expander, de-esser, compressor and limiter.
 */
export async function applyFx({ buffer, fx }: { buffer: AudioBuffer; fx: ClipFx }): Promise<AudioBuffer> {
	let out = await filterChain({ buffer, fx });
	if (fx.noise > 0 || fx.echo > 0) out = expand({ buffer: out, noise: fx.noise, echo: fx.echo });
	if (fx.deess > 0) out = await deEss({ buffer: out, amount: fx.deess });
	if (fx.comp > 0 || fx.limiter) out = await dynamics({ buffer: out, comp: fx.comp, limiter: fx.limiter });
	return out;
}

async function filterChain({ buffer, fx }: { buffer: AudioBuffer; fx: ClipFx }): Promise<AudioBuffer> {
	const filters: { type: BiquadFilterType; freq: number; gain?: number; q?: number }[] = [];
	if (fx.eq.lowCut > 0) filters.push({ type: "highpass", freq: fx.eq.lowCut });
	if (fx.eq.low) filters.push({ type: "lowshelf", freq: 200, gain: fx.eq.low });
	if (fx.eq.mid) filters.push({ type: "peaking", freq: 1200, gain: fx.eq.mid, q: 0.9 });
	if (fx.eq.high) filters.push({ type: "highshelf", freq: 5000, gain: fx.eq.high });
	for (const b of fx.bands) if (b.gain) filters.push({ type: "peaking", freq: b.freq, gain: b.gain, q: b.q });
	if (fx.presence) filters.push({ type: "peaking", freq: 3500, gain: fx.presence, q: 1.2 });
	if (!filters.length) return buffer;
	return render({
		buffer,
		build: (ctx, input) => {
			let node: AudioNode = input;
			for (const f of filters) {
				const biquad = ctx.createBiquadFilter();
				biquad.type = f.type;
				biquad.frequency.value = f.freq;
				if (f.gain !== undefined) biquad.gain.value = f.gain;
				if (f.q !== undefined) biquad.Q.value = f.q;
				node.connect(biquad);
				node = biquad;
			}
			return node;
		},
	});
}

async function render({
	buffer,
	build,
}: {
	buffer: AudioBuffer;
	build: (ctx: OfflineAudioContext, input: AudioNode) => AudioNode;
}): Promise<AudioBuffer> {
	const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	build(ctx, source).connect(ctx.destination);
	source.start(0);
	return ctx.startRendering();
}

/**
 * Downward expander keyed on the clip's own noise floor: quiet hiss
 * between words (noise) and the decaying room tail (echo) are pulled down.
 */
function expand({ buffer, noise, echo }: { buffer: AudioBuffer; noise: number; echo: number }): AudioBuffer {
	const rate = buffer.sampleRate;
	const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
	const n = buffer.length;
	const block = Math.max(1, Math.round(rate * 0.02));
	const levels: number[] = [];
	for (let i = 0; i < n; i += block) {
		let s = 0;
		const end = Math.min(n, i + block);
		for (const ch of chans) for (let j = i; j < end; j++) s += ch[j]! * ch[j]!;
		levels.push(Math.sqrt(s / Math.max(1, (end - i) * chans.length)));
	}
	const sorted = [...levels].sort((a, b) => a - b);
	const floor = Math.max(1e-5, sorted[Math.floor(sorted.length * 0.1)] ?? 1e-5);
	const peak = Math.max(floor * 2, sorted[Math.floor(sorted.length * 0.95)] ?? floor * 2);
	// Threshold sits between the noise floor and speech, higher for echo.
	const amount = Math.max(noise, echo) / 100;
	const threshold = floor * (peak / floor) ** (0.15 + 0.25 * (echo / 100));
	const range = 10 ** (-(6 + 30 * amount) / 20);
	const attack = Math.exp(-1 / (rate * 0.003));
	const release = Math.exp(-1 / (rate * (echo > noise ? 0.04 : 0.12)));
	const result = new AudioBuffer({ length: n, numberOfChannels: chans.length, sampleRate: rate });
	const outs = chans.map((_, i) => result.getChannelData(i));
	let env = 0;
	let gain = 1;
	const gainSmooth = Math.exp(-1 / (rate * 0.005));
	for (let i = 0; i < n; i++) {
		let x = 0;
		for (const ch of chans) x = Math.max(x, Math.abs(ch[i]!));
		env = x > env ? attack * env + (1 - attack) * x : release * env + (1 - release) * x;
		const target = env >= threshold ? 1 : Math.max(range, (env / threshold) ** (1 + 3 * amount));
		gain = gainSmooth * gain + (1 - gainSmooth) * target;
		for (let c = 0; c < chans.length; c++) outs[c]![i] = chans[c]![i]! * gain;
	}
	return result;
}

/** Split-band de-esser: turns down only the 5 kHz+ band when it spikes. */
async function deEss({ buffer, amount }: { buffer: AudioBuffer; amount: number }): Promise<AudioBuffer> {
	const high = await render({
		buffer,
		build: (ctx, input) => {
			const hp = ctx.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = 5000;
			hp.Q.value = 0.7;
			input.connect(hp);
			return hp;
		},
	});
	const rate = buffer.sampleRate;
	const n = buffer.length;
	const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
	const highs = chans.map((_, i) => high.getChannelData(i));
	let sum = 0;
	for (const h of highs) for (let i = 0; i < n; i++) sum += h[i]! * h[i]!;
	const avg = Math.sqrt(sum / Math.max(1, n * highs.length));
	const threshold = avg * (3 - 1.8 * (amount / 100));
	const maxCut = amount / 100;
	const coef = Math.exp(-1 / (rate * 0.004));
	const result = new AudioBuffer({ length: n, numberOfChannels: chans.length, sampleRate: rate });
	let env = 0;
	for (let i = 0; i < n; i++) {
		let x = 0;
		for (const h of highs) x = Math.max(x, Math.abs(h[i]!));
		env = Math.max(x, coef * env);
		const cut = env > threshold ? Math.min(maxCut, 1 - threshold / env) : 0;
		for (let c = 0; c < chans.length; c++) result.getChannelData(c)[i] = chans[c]![i]! - highs[c]![i]! * cut;
	}
	return result;
}

/** Compressor with automatic make-up gain, then an optional −1 dB limiter. */
async function dynamics({ buffer, comp, limiter }: { buffer: AudioBuffer; comp: number; limiter: boolean }): Promise<AudioBuffer> {
	return render({
		buffer,
		build: (ctx, input) => {
			let node: AudioNode = input;
			if (comp > 0) {
				const c = ctx.createDynamicsCompressor();
				const threshold = -10 - comp * 0.3;
				const ratio = 1.5 + comp * 0.065;
				c.threshold.value = threshold;
				c.ratio.value = ratio;
				c.knee.value = 8;
				c.attack.value = 0.006;
				c.release.value = 0.18;
				const makeup = ctx.createGain();
				// Gentle make-up gain: evens levels without making the clip much louder.
				makeup.gain.value = 10 ** (Math.min(4, -threshold * (1 - 1 / ratio) * 0.2) / 20);
				node.connect(c);
				c.connect(makeup);
				node = makeup;
			}
			if (limiter) {
				const l = ctx.createDynamicsCompressor();
				l.threshold.value = -1;
				l.knee.value = 0;
				l.ratio.value = 20;
				l.attack.value = 0.001;
				l.release.value = 0.1;
				node.connect(l);
				node = l;
			}
			return node;
		},
	});
}
