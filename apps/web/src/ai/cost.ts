/**
 * Cost estimates for AI jobs (SRS AI-47). Prices are per million tokens
 * and editable in Settings → AI, since providers change them; these are
 * only starting values.
 */
export interface ModelPrices {
	/** USD per 1M input tokens of text, images or video. */
	input: number;
	/** USD per 1M input tokens of audio. */
	audio: number;
	/** USD per 1M output tokens. */
	output: number;
}

export const DEFAULT_PRICES: Record<string, ModelPrices> = {
	"gemini-2.5-flash": { input: 0.3, audio: 1, output: 2.5 },
	"gemini-2.5-flash-lite": { input: 0.1, audio: 0.3, output: 0.4 },
	"gemini-2.5-pro": { input: 1.25, audio: 1.25, output: 10 },
};

/** Gemini counts 32 tokens per second of audio and about 4 characters per token. */
export const AUDIO_TOKENS_PER_SECOND = 32;
export const CHARS_PER_TOKEN = 4;
/** Each image or video frame. */
export const TOKENS_PER_IMAGE = 258;

export interface JobSize {
	audioSeconds?: number;
	textChars?: number;
	images?: number;
	/** Expected answer length in characters. */
	outputChars?: number;
}

export interface CostEstimate {
	inputTokens: number;
	audioTokens: number;
	outputTokens: number;
	usd: number;
}

export function pricesFor({
	model,
	overrides,
}: {
	model: string;
	overrides?: Record<string, ModelPrices>;
}): ModelPrices {
	return (
		overrides?.[model] ??
		DEFAULT_PRICES[model] ??
		// Unknown model: assume the dearer end so the cap still protects.
		{ input: 1.25, audio: 1.25, output: 10 }
	);
}

export function estimateCost({
	size,
	prices,
}: {
	size: JobSize;
	prices: ModelPrices;
}): CostEstimate {
	const audioTokens = Math.ceil((size.audioSeconds ?? 0) * AUDIO_TOKENS_PER_SECOND);
	const inputTokens =
		Math.ceil((size.textChars ?? 0) / CHARS_PER_TOKEN) +
		(size.images ?? 0) * TOKENS_PER_IMAGE +
		// Instructions and schema sent with every request.
		400;
	const outputTokens = Math.ceil((size.outputChars ?? 0) / CHARS_PER_TOKEN) + 50;
	const usd =
		(inputTokens * prices.input + audioTokens * prices.audio + outputTokens * prices.output) /
		1_000_000;
	return { inputTokens, audioTokens, outputTokens, usd };
}

/** Cost of a finished request from the token counts the provider reports. */
export function costFromUsage({
	usage,
	prices,
	audioShare = 0,
}: {
	usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
	prices: ModelPrices;
	/** Share of the prompt tokens that were audio (0–1). */
	audioShare?: number;
}): number {
	const prompt = usage.promptTokenCount ?? 0;
	const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
	return (
		(prompt * (1 - audioShare) * prices.input +
			prompt * audioShare * prices.audio +
			output * prices.output) /
		1_000_000
	);
}

/** "about $0.02" or "less than $0.01", for estimates. */
export function aboutUsd(usd: number): string {
	return usd < 0.01 ? "less than $0.01" : `about ${formatUsd(usd)}`;
}

export function formatUsd(usd: number): string {
	if (usd === 0) return "$0";
	if (usd < 0.01) return "under $0.01";
	return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
