/** The desktop app's Gemini bridge (electron/ai.js). */
export interface AiState {
	hasKey: boolean;
	/** Saved encrypted on this device (false = this session only). */
	remembered: boolean;
	encryption: boolean;
	defaultModel: string;
}

export type AiPart = { text: string } | { data: ArrayBuffer; mimeType: string };

export type AiResult<T> =
	| ({ ok: true } & T)
	| { ok: false; code: string; message: string };

export interface AiBridge {
	getState: () => Promise<AiState>;
	setKey: (args: { key: string }) => Promise<AiState>;
	clearKey: () => Promise<AiState>;
	test: (args: { model?: string }) => Promise<AiResult<object>>;
	generate: (args: {
		model?: string;
		system?: string;
		parts: AiPart[];
		schema?: object;
		temperature?: number;
	}) => Promise<AiResult<{ text: string }>>;
	cancel: () => Promise<void>;
}

export function aiBridge(): AiBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.ai ?? null;
}
