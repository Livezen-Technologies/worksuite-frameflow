/** The desktop app's AI bridge (electron/ai.js): Gemini, Claude or OpenAI. */
export type AiProviderId = "gemini" | "claude" | "openai";

export interface AiState {
	hasKey: boolean;
	/** Saved encrypted on this device (false = this session only). */
	remembered: boolean;
	encryption: boolean;
	defaultModel: string;
	/** Per provider (AI-51); the fields above are Gemini's. */
	keys?: Record<AiProviderId, { hasKey: boolean; remembered: boolean }>;
	defaultModels?: Record<AiProviderId, string>;
}

export type AiPart = { text: string } | { data: ArrayBuffer; mimeType: string };

export type AiResult<T> =
	| ({ ok: true } & T)
	| { ok: false; code: string; message: string };

export interface AiBridge {
	getState: () => Promise<AiState>;
	setKey: (args: { key: string; provider?: AiProviderId }) => Promise<AiState>;
	clearKey: (args?: { provider?: AiProviderId }) => Promise<AiState>;
	test: (args: { model?: string; provider?: AiProviderId }) => Promise<AiResult<object>>;
	generate: (args: {
		provider?: AiProviderId;
		model?: string;
		system?: string;
		parts: AiPart[];
		schema?: object;
		temperature?: number;
	}) => Promise<
		AiResult<{
			text: string;
			/** Token counts the provider reports (AI-47). */
			usage?: {
				promptTokenCount?: number;
				candidatesTokenCount?: number;
				thoughtsTokenCount?: number;
			} | null;
			model?: string;
			/** Tries it took, after rate-limit retries (AI-48). */
			attempts?: number;
		}>
	>;
	cancel: () => Promise<void>;
}

export function aiBridge(): AiBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.ai ?? null;
}
