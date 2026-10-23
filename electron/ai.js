const { app, net, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const network = require("./network");
const providers = require("./ai-providers");

/**
 * AI access for the AI features (SRS AI-01–AI-06, AI-51): Gemini, Claude
 * or OpenAI. The user's own API key for each is kept here, encrypted with
 * the OS keychain, and never sent to the page; the page sends a prompt and
 * a response schema, this module adds the key and calls that provider.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_PATTERN = /^gemini-[a-z0-9.\-]+$/;
const MAX_REQUEST_BYTES = 19 * 1024 * 1024; // inline data limit is 20 MB

const PROVIDERS = ["gemini", "claude", "openai"];
const providerOf = (value) => (PROVIDERS.includes(value) ? value : "gemini");
const keyFile = (provider = "gemini") =>
	path.join(app.getPath("userData"), provider === "gemini" ? "ai-key.bin" : `ai-key-${provider}.bin`);
const sessionKeys = new Map(); // used when the OS can't encrypt
let controllers = new Set();

function readKey(provider = "gemini") {
	if (sessionKeys.has(provider)) return sessionKeys.get(provider);
	try {
		const data = fs.readFileSync(keyFile(provider));
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

async function call({ model, body, provider = "gemini", request }) {
	let lastError = null;
	// The Claude SDK retries on its own.
	const attempts = provider === "claude" ? 1 : MAX_ATTEMPTS;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const result =
				provider === "gemini" ? await callOnce({ model, body }) : await callProvider({ provider, model, request });
			return { ...result, attempts: attempt };
		} catch (error) {
			lastError = error;
			const retryable =
				(error.code === "quota" && !/per.?day|daily/i.test(error.message)) || error.code === "server";
			if (!retryable || attempt === attempts) throw error;
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

async function callProvider({ provider, model, request }) {
	const key = readKey(provider);
	if (!key)
		throw Object.assign(new Error(`Add your ${providers.NAMES[provider]} API key in Settings → AI.`), { code: "no-key" });
	network.assertOnline();
	const controller = new AbortController();
	controllers.add(controller);
	try {
		return await providers[provider]({ key, model, ...request, signal: controller.signal });
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
		const keys = Object.fromEntries(
			PROVIDERS.map((p) => [
				p,
				{ hasKey: !!readKey(p), remembered: !sessionKeys.has(p) && fs.existsSync(keyFile(p)) },
			]),
		);
		return {
			hasKey: keys.gemini.hasKey,
			remembered: keys.gemini.remembered,
			encryption: safeStorage.isEncryptionAvailable(),
			defaultModel: DEFAULT_MODEL,
			keys,
			defaultModels: { gemini: DEFAULT_MODEL, ...providers.DEFAULT_MODELS },
		};
	},

	async setKey({ key, provider }) {
		const which = providerOf(provider);
		const value = String(key ?? "").trim();
		if (!value) throw new Error("Empty key");
		if (safeStorage.isEncryptionAvailable()) {
			await fs.promises.writeFile(keyFile(which), safeStorage.encryptString(value), { mode: 0o600 });
			sessionKeys.delete(which);
		} else {
			// No keychain: keep it for this session only rather than in plain text.
			sessionKeys.set(which, value);
		}
		return module.exports.getState();
	},

	async clearKey({ provider } = {}) {
		const which = providerOf(provider);
		sessionKeys.delete(which);
		await fs.promises.rm(keyFile(which), { force: true });
		return module.exports.getState();
	},

	test: wrap(async ({ model, provider }) => {
		const which = providerOf(provider);
		if (which !== "gemini") {
			await call({ provider: which, model, request: { parts: [{ text: "Reply with OK." }] } });
			return {};
		}
		await call({ model, body: { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }] } });
		return {};
	}),

	/**
	 * parts: [{ text }] or [{ data: ArrayBuffer, mimeType }]; schema is a
	 * Gemini response schema, so the answer comes back as JSON.
	 */
	generate: wrap(async ({ provider, model, system, parts, schema, temperature }) => {
		const which = providerOf(provider);
		if (which !== "gemini")
			return call({
				provider: which,
				model,
				request: { system, parts: Array.isArray(parts) ? parts : [], schema },
			});
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
