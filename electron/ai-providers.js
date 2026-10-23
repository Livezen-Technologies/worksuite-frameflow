const { net } = require("electron");
const Anthropic = require("@anthropic-ai/sdk").default;

/**
 * Claude and OpenAI behind the same generate() as Gemini (SRS AI-51). The
 * page's requests carry a Gemini-style response schema; it is turned into
 * JSON Schema here, and usage is reported in Gemini's field names so cost
 * tracking (AI-47) works the same for every provider.
 */

const DEFAULT_MODELS = { claude: "claude-opus-5-5", openai: "gpt-5" };
const MODEL_PATTERNS = { claude: /^claude-[a-z0-9.\-]+$/, openai: /^(gpt|o\d|chatgpt)[a-z0-9.\-]*$/ };
const NAMES = { claude: "Claude", openai: "OpenAI" };

/** Gemini's schema dialect (upper-case types) → JSON Schema for structured outputs. */
function toJsonSchema(schema) {
	if (!schema || typeof schema !== "object") return schema;
	if (Array.isArray(schema)) return schema.map(toJsonSchema);
	const out = {};
	for (const [key, value] of Object.entries(schema)) {
		// Numeric and length limits aren't accepted; the page validates answers anyway.
		if (["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "propertyOrdering", "nullable"].includes(key)) continue;
		if (key === "type") out.type = String(value).toLowerCase();
		else if (key === "properties")
			out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSchema(v)]));
		else if (key === "items") out.items = toJsonSchema(value);
		else out[key] = value;
	}
	if (schema.nullable && out.type) out.type = [out.type, "null"];
	if (out.type === "object") out.additionalProperties = false;
	return out;
}

/** Every property required: OpenAI's strict mode needs it. */
function allRequired(schema) {
	if (!schema || typeof schema !== "object") return true;
	if (schema.properties) {
		const keys = Object.keys(schema.properties);
		const required = new Set(schema.required ?? []);
		if (!keys.every((k) => required.has(k))) return false;
		return keys.every((k) => allRequired(schema.properties[k]));
	}
	return schema.items ? allRequired(schema.items) : true;
}

const fail = (message, code) => Object.assign(new Error(message), { code });

function checkModel({ provider, model }) {
	return MODEL_PATTERNS[provider].test(String(model ?? "")) ? model : DEFAULT_MODELS[provider];
}

function noAudio({ provider, parts }) {
	if (parts.some((p) => p.data && !String(p.mimeType).startsWith("image/")))
		throw fail(`${NAMES[provider]} can't take audio here. Transcription uses Gemini or local Whisper.`, "unsupported");
}

const base64 = (data) => Buffer.from(data).toString("base64");

/** Claude through the official SDK; it retries 429/5xx with backoff itself (AI-48). */
async function claude({ key, model, system, parts, schema, signal }) {
	noAudio({ provider: "claude", parts });
	const name = checkModel({ provider: "claude", model });
	const client = new Anthropic({ apiKey: key, maxRetries: 3 });
	const content = parts.map((p) =>
		p.data
			? { type: "image", source: { type: "base64", media_type: String(p.mimeType), data: base64(p.data) } }
			: { type: "text", text: String(p.text ?? "") },
	);
	let response;
	try {
		response = await client.beta.messages.create(
			{
				model: name,
				max_tokens: 16000,
				...(system ? { system: String(system) } : {}),
				messages: [{ role: "user", content }],
				output_config: {
					effort: "medium",
					...(schema ? { format: { type: "json_schema", schema: toJsonSchema(schema) } } : {}),
				},
				// On a policy decline, the API retries on a suitable model in the same call.
				betas: ["server-side-fallback-2026-07-01"],
				fallbacks: "default",
			},
			{ signal },
		);
	} catch (error) {
		if (error instanceof Anthropic.APIUserAbortError) throw fail("Cancelled", "cancelled");
		if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
			throw fail("Claude didn't accept the API key. Check it in Settings → AI.", "key");
		if (error instanceof Anthropic.RateLimitError) throw fail(error.message, "quota");
		if (error instanceof Anthropic.InternalServerError) throw fail(error.message, "server");
		if (error instanceof Anthropic.APIConnectionError) throw fail(error.message, "server");
		if (error instanceof Anthropic.APIError) throw fail(error.message, "request");
		throw error;
	}
	if (response.stop_reason === "refusal")
		throw fail(`Claude declined this request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}.`, "refused");
	const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
	if (!text || response.stop_reason === "max_tokens")
		throw fail(`Claude gave no complete answer (${response.stop_reason})`, "empty");
	const usage = response.usage ?? {};
	return {
		text,
		model: response.model ?? name,
		usage: {
			promptTokenCount: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
			candidatesTokenCount: usage.output_tokens ?? 0,
		},
	};
}

/** OpenAI's Responses API over HTTPS. */
async function openai({ key, model, system, parts, schema, signal }) {
	noAudio({ provider: "openai", parts });
	const name = checkModel({ provider: "openai", model });
	const json = schema ? toJsonSchema(schema) : null;
	const body = {
		model: name,
		...(system ? { instructions: String(system) } : {}),
		input: [
			{
				role: "user",
				content: parts.map((p) =>
					p.data
						? { type: "input_image", image_url: `data:${p.mimeType};base64,${base64(p.data)}` }
						: { type: "input_text", text: String(p.text ?? "") },
				),
			},
		],
		...(json ? { text: { format: { type: "json_schema", name: "result", schema: json, strict: allRequired(json) } } } : {}),
	};
	const res = await net.fetch("https://api.openai.com/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
		body: JSON.stringify(body),
		signal,
	});
	const answer = await res.json().catch(() => null);
	if (!res.ok) {
		const message = answer?.error?.message ?? `OpenAI returned ${res.status}`;
		const code = res.status === 401 || res.status === 403 ? "key" : res.status === 429 ? "quota" : res.status >= 500 ? "server" : "request";
		const error = fail(code === "key" ? "OpenAI didn't accept the API key. Check it in Settings → AI." : message, code);
		const retry = parseFloat(res.headers.get("retry-after") ?? "");
		if (Number.isFinite(retry)) error.retryAfter = retry;
		if (/insufficient_quota/.test(answer?.error?.code ?? "")) error.message = "Your OpenAI quota is used up (daily).";
		throw error;
	}
	const text = (answer?.output ?? [])
		.flatMap((item) => item.content ?? [])
		.filter((c) => c.type === "output_text")
		.map((c) => c.text)
		.join("");
	if (!text) throw fail(`OpenAI gave no answer (${answer?.status ?? "empty"})`, "empty");
	return {
		text,
		model: answer.model ?? name,
		usage: {
			promptTokenCount: answer.usage?.input_tokens ?? 0,
			candidatesTokenCount: answer.usage?.output_tokens ?? 0,
		},
	};
}

module.exports = { claude, openai, toJsonSchema, allRequired, DEFAULT_MODELS, NAMES };
