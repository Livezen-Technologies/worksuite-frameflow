import { aiBridge, type AiPart } from "./bridge";
import { cacheKey, readCache, writeCache } from "./cache";
import {
	costFromUsage,
	estimateCost,
	aboutUsd,
	formatUsd,
	pricesFor,
	type CostEstimate,
	type JobSize,
} from "./cost";
import { fitsCap, useAiSpend } from "./spend";
import { useAiSettings } from "./store";

export class AiError extends Error {
	readonly code: string;
	constructor({ message, code }: { message: string; code: string }) {
		super(message);
		this.code = code;
	}
}

const MESSAGES: Record<string, string> = {
	"no-key": "Add your Gemini API key in Settings → AI.",
	key: "Gemini didn't accept the API key. Check it in Settings → AI.",
	quota:
		"Your Gemini quota is used up for now. Try again later or check your Google AI plan.",
	offline: "You're working offline. Turn off offline mode to use AI features.",
	server: "Gemini is having trouble right now. Try again in a minute.",
};

export interface AiRequest {
	system: string;
	schema: object;
	text: string;
}

export interface AiAnswer {
	text: string;
	usd: number;
	cached: boolean;
}

/**
 * One interface for every AI provider (SRS AI-51). Each job is estimated,
 * checked against the spending cap (AI-47), answered from the cache when
 * it can be (AI-49), sent with rate-limit retries (AI-48), and its real
 * cost recorded. Callers then validate the answer against a schema.
 */
export interface AiProvider {
	id: string;
	name: string;
	estimateCost: (size: JobSize) => CostEstimate;
	transcribe: (args: {
		request: AiRequest;
		audio: { data: ArrayBuffer; mimeType: string; seconds: number };
	}) => Promise<AiAnswer>;
	rewriteText: (args: { request: AiRequest; kind: string }) => Promise<AiAnswer>;
	analyseFrames: (args: {
		request: AiRequest;
		frames: { data: ArrayBuffer; mimeType: string }[];
	}) => Promise<AiAnswer>;
}

class GeminiProvider implements AiProvider {
	readonly id = "gemini";
	readonly name = "Gemini";

	private model(): string {
		return useAiSettings.getState().model || "gemini-2.5-flash";
	}

	estimateCost(size: JobSize): CostEstimate {
		return estimateCost({
			size,
			prices: pricesFor({ model: this.model(), overrides: useAiSpend.getState().prices }),
		});
	}

	private async run({
		kind,
		request,
		parts,
		size,
		audioShare,
	}: {
		kind: string;
		request: AiRequest;
		parts: AiPart[];
		size: JobSize;
		audioShare: number;
	}): Promise<AiAnswer> {
		const bridge = aiBridge();
		if (!bridge)
			throw new AiError({ message: "AI features need the desktop app.", code: "unavailable" });
		const model = this.model();
		const key = await cacheKey({ model, system: request.system, schema: request.schema, parts });
		const hit = await readCache(key);
		if (hit) {
			useAiSpend.getState().record({ kind, usd: 0, cached: true });
			return { text: hit.text, usd: 0, cached: true };
		}
		const estimate = this.estimateCost(size);
		const cap = fitsCap({ usd: estimate.usd });
		if (!cap.ok)
			throw new AiError({
				code: "cap",
				message: `This would go over your AI spending cap (${formatUsd(cap.remaining ?? 0)} left this month, ${aboutUsd(estimate.usd)} needed). Raise the cap in Settings → AI.`,
			});
		const result = await bridge.generate({
			model: model || undefined,
			system: request.system,
			parts,
			schema: request.schema,
		});
		if (!result.ok)
			throw new AiError({ message: MESSAGES[result.code] ?? result.message, code: result.code });
		const prices = pricesFor({
			model: result.model ?? model,
			overrides: useAiSpend.getState().prices,
		});
		const usd = result.usage
			? costFromUsage({ usage: result.usage, prices, audioShare })
			: estimate.usd;
		useAiSpend.getState().record({ kind, usd, cached: false });
		await writeCache({ key, answer: { text: result.text, model: result.model ?? model, at: Date.now() } });
		return { text: result.text, usd, cached: false };
	}

	transcribe({
		request,
		audio,
	}: {
		request: AiRequest;
		audio: { data: ArrayBuffer; mimeType: string; seconds: number };
	}) {
		return this.run({
			kind: "transcribe",
			request,
			parts: [{ data: audio.data, mimeType: audio.mimeType }, { text: request.text }],
			size: { audioSeconds: audio.seconds, textChars: request.text.length, outputChars: audio.seconds * 18 },
			audioShare: 0.9,
		});
	}

	rewriteText({ request, kind }: { request: AiRequest; kind: string }) {
		return this.run({
			kind,
			request,
			parts: [{ text: request.text }],
			size: { textChars: request.text.length, outputChars: request.text.length },
			audioShare: 0,
		});
	}

	analyseFrames({
		request,
		frames,
	}: {
		request: AiRequest;
		frames: { data: ArrayBuffer; mimeType: string }[];
	}) {
		return this.run({
			kind: "frames",
			request,
			parts: [...frames, { text: request.text }],
			size: { images: frames.length, textChars: request.text.length, outputChars: 2000 },
			audioShare: 0,
		});
	}
}

let current: AiProvider | null = null;

/** The provider in use; Gemini today, others plug in behind the same interface. */
export function aiProvider(): AiProvider {
	return (current ??= new GeminiProvider());
}
