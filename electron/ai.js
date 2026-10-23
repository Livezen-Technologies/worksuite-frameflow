const { app, net, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const network = require("./network");

/**
 * Gemini access for the AI features (SRS AI-01–AI-06). The user's own API
 * key is kept here, encrypted with the OS keychain, and never sent to the
 * page; the page sends a prompt and a response schema, this module adds
 * the key and calls Google's Generative Language API, nothing else.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_PATTERN = /^gemini-[a-z0-9.\-]+$/;
const MAX_REQUEST_BYTES = 19 * 1024 * 1024; // inline data limit is 20 MB

const keyFile = () => path.join(app.getPath("userData"), "ai-key.bin");
let sessionKey = null; // used when the OS can't encrypt
let controllers = new Set();

function readKey() {
	if (sessionKey) return sessionKey;
	try {
		const data = fs.readFileSync(keyFile());
		return safeStorage.decryptString(data);
	} catch {
		return null;
	}
}

function errorFrom({ status, body }) {
	const message = body?.error?.message ?? `Gemini returned ${status}`;
	const code =
		status === 400 && /API key/i.test(message)
			? "key"
			: status === 401 || status === 403
				? "key"
				: status === 429
					? "quota"
					: status >= 500
						? "server"
						: "request";
	return Object.assign(new Error(message), { code });
}

const sleep = (ms, signal) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
		});
	});

/** Seconds Gemini asks us to wait (RetryInfo), if it says. */
function retryDelaySeconds(body) {
	const info = body?.error?.details?.find?.((d) => String(d["@type"] ?? "").endsWith("RetryInfo"));
	const value = parseFloat(String(info?.retryDelay ?? ""));
	return Number.isFinite(value) ? value : null;
}

/**
 * Rate limits and server hiccups are retried with backoff (SRS AI-48). A
 * used-up daily quota is not. Failed requests aren't billed by Gemini, so
 * a retry never charges twice; only the final answer's usage is reported.
 */
const MAX_ATTEMPTS = 4;

async function call({ model, body }) {
	let lastError = null;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const result = await callOnce({ model, body });
			return { ...result, attempts: attempt };
		} catch (error) {
			lastError = error;
			const retryable =
				(error.code === "quota" && !/per.?day|daily/i.test(error.message)) || error.code === "server";
			if (!retryable || attempt === MAX_ATTEMPTS) throw error;
			const hinted = error.retryAfter ?? null;
			const wait = Math.min(60, hinted ?? 2 ** attempt) * 1000 + Math.random() * 250;
			const controller = new AbortController();
			controllers.add(controller);
			try {
				await sleep(wait, controller.signal);
			} catch {
				throw Object.assign(new Error("Cancelled"), { code: "cancelled" });
			} finally {
				controllers.delete(controller);
			}
		}
	}
	throw lastError;
}

async function callOnce({ model, body }) {
	const key = readKey();
	if (!key) throw Object.assign(new Error("Add your Gemini API key in Settings → AI."), { code: "no-key" });
	network.assertOnline();
	const name = MODEL_PATTERN.test(String(model)) ? model : DEFAULT_MODEL;
	const payload = JSON.stringify(body);
	if (payload.length > MAX_REQUEST_BYTES) throw Object.assign(new Error("Request too large"), { code: "request" });
	const controller = new AbortController();
	controllers.add(controller);
	try {
		const res = await net.fetch(`${ENDPOINT}/${name}:generateContent`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: payload,
			signal: controller.signal,
		});
		const json = await res.json().catch(() => null);
		if (!res.ok) {
			const error = errorFrom({ status: res.status, body: json });
			const header = parseFloat(res.headers.get("retry-after") ?? "");
			error.retryAfter = Number.isFinite(header) ? header : retryDelaySeconds(json);
			throw error;
		}
		const candidate = json?.candidates?.[0];
		const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
		if (!text) {
			const reason = candidate?.finishReason ?? json?.promptFeedback?.blockReason ?? "empty";
			throw Object.assign(new Error(`Gemini gave no answer (${reason})`), { code: "empty" });
		}
		return { text, usage: json.usageMetadata ?? null, model: name };
	} catch (error) {
		if (error.name === "AbortError") throw Object.assign(new Error("Cancelled"), { code: "cancelled" });
		throw error;
	} finally {
		controllers.delete(controller);
	}
}

/** Results go back as {ok,...} so error codes survive IPC. */
const wrap = (fn) => async (args) => {
	try {
		return { ok: true, ...(await fn(args ?? {})) };
	} catch (error) {
		return { ok: false, code: error.code ?? "error", message: error.message };
	}
};

module.exports = {
	getState() {
		return {
			hasKey: !!readKey(),
			remembered: !sessionKey && fs.existsSync(keyFile()),
			encryption: safeStorage.isEncryptionAvailable(),
			defaultModel: DEFAULT_MODEL,
		};
	},

	async setKey({ key }) {
		const value = String(key ?? "").trim();
		if (!value) throw new Error("Empty key");
		if (safeStorage.isEncryptionAvailable()) {
			await fs.promises.writeFile(keyFile(), safeStorage.encryptString(value), { mode: 0o600 });
			sessionKey = null;
		} else {
			// No keychain: keep it for this session only rather than in plain text.
			sessionKey = value;
		}
		return module.exports.getState();
	},

	async clearKey() {
		sessionKey = null;
		await fs.promises.rm(keyFile(), { force: true });
		return module.exports.getState();
	},

	test: wrap(async ({ model }) => {
		await call({ model, body: { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }] } });
		return {};
	}),

	/**
	 * parts: [{ text }] or [{ data: ArrayBuffer, mimeType }]; schema is a
	 * Gemini response schema, so the answer comes back as JSON.
	 */
	generate: wrap(async ({ model, system, parts, schema, temperature }) => {
		const body = {
			contents: [
				{
					role: "user",
					parts: (Array.isArray(parts) ? parts : []).map((part) =>
						part.data
							? {
									inline_data: {
										mime_type: String(part.mimeType),
										data: Buffer.from(part.data).toString("base64"),
									},
								}
							: { text: String(part.text ?? "") },
					),
				},
			],
			generationConfig: {
				temperature: typeof temperature === "number" ? temperature : 0.2,
				...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
			},
			...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
		};
		return call({ model, body });
	}),

	cancel() {
		for (const controller of controllers) controller.abort();
		controllers = new Set();
	},
};
