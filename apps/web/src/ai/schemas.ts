import { z } from "zod";

/**
 * Every AI answer is checked against a strict schema before anything from
 * it enters the project (SRS AI-51). An answer of the wrong shape is
 * rejected as a whole; single bad items inside a good answer are dropped.
 */
export const TextResultItem = z.object({
	id: z.string().min(1).max(100),
	text: z.string().max(5000),
});

export const TextResultsAnswer = z.object({
	segments: z.array(z.unknown()).max(1000),
});

export const TranscribeItem = z.object({
	text: z.string().max(5000),
	// Out-of-range times are clamped to the chunk afterwards.
	start: z.coerce.number().finite(),
	end: z.coerce.number().finite(),
});

export const TranscribeAnswer = z.object({
	segments: z.array(z.unknown()).max(5000),
});

/** Frame analysis (zoom, clip and caption suggestions; AI-52, AI-53). */
export const SuggestionItem = z.object({
	kind: z.enum(["zoom", "clip", "caption", "reframe"]),
	start: z.coerce.number().finite().min(0),
	end: z.coerce.number().finite().min(0),
	title: z.string().max(200).optional(),
	reason: z.string().max(500).optional(),
	confidence: z.coerce.number().min(0).max(1),
	x: z.coerce.number().min(0).max(1).optional(),
	y: z.coerce.number().min(0).max(1).optional(),
	text: z.string().max(2000).optional(),
});

export const SuggestionsAnswer = z.object({
	suggestions: z.array(z.unknown()).max(500),
});

export class AiOutputError extends Error {
	readonly code = "invalid";
}

/** Parses JSON (also inside a code fence) and checks the top-level shape. */
export function parseAnswer<T extends z.ZodTypeAny>({
	text,
	schema,
}: {
	text: string;
	schema: T;
}): z.infer<T> {
	let data: unknown = null;
	try {
		data = JSON.parse(text);
	} catch {
		const match = text.match(/\{[\s\S]*\}/);
		if (match)
			try {
				data = JSON.parse(match[0]);
			} catch {
				data = null;
			}
	}
	const result = schema.safeParse(data);
	if (!result.success)
		throw new AiOutputError(
			"The AI answer wasn't in the expected format, so nothing was changed.",
		);
	return result.data;
}

/** Keeps the items that pass `item`; returns how many were dropped. */
export function validItems<T extends z.ZodTypeAny>({
	items,
	item,
}: {
	items: unknown[];
	item: T;
}): { items: z.infer<T>[]; dropped: number } {
	const out: z.infer<T>[] = [];
	for (const value of items) {
		const result = item.safeParse(value);
		if (result.success) out.push(result.data);
	}
	return { items: out, dropped: items.length - out.length };
}
