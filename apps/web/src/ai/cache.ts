import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import type { AiPart } from "./bridge";

/**
 * AI results cached by a hash of the media and settings (SRS AI-49): the
 * same audio or text with the same model, prompt and schema is answered
 * from here, at no cost, instead of being sent again.
 */
interface CachedAnswer {
	text: string;
	model: string;
	at: number;
}

const MAX_AGE_MS = 90 * 24 * 3600 * 1000;

let adapter: IndexedDBAdapter<CachedAnswer> | null = null;
const store = () =>
	(adapter ??= new IndexedDBAdapter<CachedAnswer>({
		dbName: "frameflow-ai-cache",
		storeName: "answers",
		version: 1,
	}));

async function sha256(data: ArrayBuffer | string): Promise<string> {
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheKey({
	model,
	system,
	schema,
	parts,
}: {
	model: string;
	system?: string;
	schema?: object;
	parts: AiPart[];
}): Promise<string> {
	const partKeys = await Promise.all(
		parts.map(async (part) =>
			"data" in part ? `${part.mimeType}:${await sha256(part.data)}` : `text:${part.text}`,
		),
	);
	return sha256(JSON.stringify({ model, system, schema, parts: partKeys }));
}

export async function readCache(key: string): Promise<CachedAnswer | null> {
	try {
		const hit = await store().get(key);
		if (!hit || Date.now() - hit.at > MAX_AGE_MS) return null;
		return hit;
	} catch {
		return null;
	}
}

export async function writeCache({
	key,
	answer,
}: {
	key: string;
	answer: CachedAnswer;
}): Promise<void> {
	try {
		await store().set({ key, value: answer });
	} catch {
		// A full or blocked cache never stops the job.
	}
}

export async function clearAiCache(): Promise<void> {
	await store().clear().catch(() => {});
}
