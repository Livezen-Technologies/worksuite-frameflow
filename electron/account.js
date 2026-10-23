// Worksuite Cloud sign-in: OpenID Connect Authorization Code + PKCE in the
// system browser with a loopback redirect (RFC 8252, RFC 7636).
// Refresh tokens are encrypted with Electron safeStorage, whose key lives in
// the OS keychain (macOS Keychain, Windows DPAPI, libsecret). Access tokens
// stay in memory and are never handed to the renderer.
const { app, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const CONFIG = {
	issuer: process.env.WSC_ISSUER || "https://accounts.worksuitecloud.com",
	clientId: process.env.WSC_CLIENT_ID || "worksuite-frameflow",
	apiBase: process.env.WSC_API_BASE || "https://api.worksuitecloud.com",
	manageUrl: process.env.WSC_MANAGE_URL || "https://worksuitecloud.com/account",
	scope: "openid profile email offline_access wve.projects wve.assets",
};
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

const tokenFile = () => path.join(app.getPath("userData"), "account-token.bin");
const profileFile = () => path.join(app.getPath("userData"), "account-profile.json");
const workspaceFile = () => path.join(app.getPath("userData"), "account-workspace.json");

const base64url = (buf) => buf.toString("base64url");

let discovery = null;
let accessToken = null;
let accessTokenExpiresAt = 0;
let pending = null;
let state = { status: "signed-out", profile: null, error: null, signIn: null };
const listeners = new Set();

function setState(next) {
	state = { ...state, ...next };
	if (state.status !== "signing-in") state.signIn = null;
	for (const listener of listeners) listener(state);
}

function onChange(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function getDiscovery() {
	if (discovery) return discovery;
	const res = await fetch(`${CONFIG.issuer}/.well-known/openid-configuration`);
	if (!res.ok) throw new Error(`Worksuite Cloud is unreachable (${res.status})`);
	discovery = await res.json();
	return discovery;
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

function saveRefreshToken(token) {
	if (!safeStorage.isEncryptionAvailable()) {
		// Never fall back to plaintext on disk; the session lasts until quit.
		return;
	}
	fs.writeFileSync(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
}

function loadRefreshToken() {
	try {
		return safeStorage.decryptString(fs.readFileSync(tokenFile()));
	} catch {
		return null;
	}
}

let memoryRefreshToken = null;

function clearLocalSession() {
	accessToken = null;
	accessTokenExpiresAt = 0;
	memoryRefreshToken = null;
	fs.rmSync(tokenFile(), { force: true });
	fs.rmSync(profileFile(), { force: true });
	fs.rmSync(workspaceFile(), { force: true });
}

function decodeJwtPayload(jwt) {
	try {
		return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

async function tokenRequest(params) {
	const { token_endpoint } = await getDiscovery();
	const res = await fetch(token_endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: CONFIG.clientId, ...params }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = new Error(body.error_description || body.error || `Token request failed (${res.status})`);
		err.code = body.error;
		throw err;
	}
	return body;
}

function acceptTokens(tokens) {
	accessToken = tokens.access_token;
	accessTokenExpiresAt = Date.now() + (tokens.expires_in ?? 900) * 1000;
	if (tokens.refresh_token) {
		memoryRefreshToken = tokens.refresh_token;
		saveRefreshToken(tokens.refresh_token);
	}
}

// Profile, plan and entitlements from /v1/me, falling back to the OIDC
// userinfo endpoint until the Worksuite API is live. Cached without tokens.
async function fetchProfile(idTokenClaims) {
	let me = null;
	try {
		const res = await fetch(`${CONFIG.apiBase}/v1/me`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (res.ok) me = await res.json();
	} catch {}
	if (!me) {
		try {
			const { userinfo_endpoint } = await getDiscovery();
			if (userinfo_endpoint) {
				const res = await fetch(userinfo_endpoint, {
					headers: { Authorization: `Bearer ${accessToken}` },
				});
				if (res.ok) me = await res.json();
			}
		} catch {}
	}
	me = { ...(idTokenClaims || {}), ...(me || {}) };
	const workspaces = normalizeWorkspaces(me);
	const saved = readJson(workspaceFile())?.id;
	const workspaceId =
		(workspaces.some((w) => w.id === saved) && saved) ||
		(workspaces.some((w) => w.id === me.active_workspace_id) && me.active_workspace_id) ||
		workspaces[0]?.id ||
		null;
	const profile = withActiveWorkspace({
		id: me.id ?? me.sub ?? null,
		name: me.name ?? me.given_name ?? me.email ?? "Worksuite member",
		email: me.email ?? null,
		picture: me.picture ?? me.avatar_url ?? null,
		account: {
			plan: me.plan ?? null,
			storageQuota: me.storage_quota ?? null,
			storageUsed: me.storage_used ?? null,
		},
		features: Array.isArray(me.features) ? me.features : [],
		workspaces,
		workspaceId,
		cachedAt: Date.now(),
	});
	fs.writeFileSync(profileFile(), JSON.stringify(profile), { mode: 0o600 });
	return profile;
}

// Worksuite Cloud workspaces: the personal account plus any teams or
// organisations the user belongs to. /v1/me lists them as
// `workspaces: [{ id, name, type, role, plan, storage_quota, storage_used }]`.
function normalizeWorkspaces(me) {
	if (!Array.isArray(me.workspaces)) return [];
	return me.workspaces
		.filter((w) => w && (typeof w.id === "string" || typeof w.id === "number"))
		.map((w) => ({
			id: String(w.id),
			name: typeof w.name === "string" && w.name ? w.name : "Workspace",
			type: w.type === "personal" ? "personal" : "team",
			role: typeof w.role === "string" ? w.role : null,
			plan: w.plan ?? null,
			storageQuota: w.storage_quota ?? null,
			storageUsed: w.storage_used ?? null,
		}));
}

// Plan and storage shown in the app are the active workspace's, when the
// server reports them per workspace; otherwise the account's.
function withActiveWorkspace(profile) {
	const active = profile.workspaces.find((w) => w.id === profile.workspaceId);
	return {
		...profile,
		plan: active?.plan ?? profile.account.plan,
		storageQuota: active?.storageQuota ?? profile.account.storageQuota,
		storageUsed: active?.storageUsed ?? profile.account.storageUsed,
	};
}

function switchWorkspace(id) {
	const profile = state.profile;
	if (!profile || !profile.workspaces.some((w) => w.id === id)) {
		throw new Error("That workspace isn't available to this account.");
	}
	fs.writeFileSync(workspaceFile(), JSON.stringify({ id }), { mode: 0o600 });
	const next = withActiveWorkspace({ ...profile, workspaceId: id });
	fs.writeFileSync(profileFile(), JSON.stringify(next), { mode: 0o600 });
	setState({ profile: next });
	return next;
}

/** Header that scopes Worksuite Cloud API calls to the chosen workspace. */
function workspaceHeaders() {
	const id = state.profile?.workspaceId;
	return id ? { "X-Worksuite-Workspace": id } : {};
}

function callbackPage(title, message) {
	return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-weight:600">${title}</h1><p style="opacity:.75">${message}</p></div></body>`;
}

// Opens the authorize URL in the system browser and waits for the code on a
// single-use 127.0.0.1 listener that closes after one callback or 10 minutes.
function waitForCode({ authorizationEndpoint, params }) {
	return new Promise((resolve, reject) => {
		let timer = null;
		let redirectUri = null;
		const server = http.createServer((req, res) => {
			const url = new URL(req.url, "http://127.0.0.1");
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const error = url.searchParams.get("error");
			const code = url.searchParams.get("code");
			const ok = !error && code && url.searchParams.get("state") === params.state;
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(
				ok
					? callbackPage("You're signed in", "You can close this tab and return to Worksuite FrameFlow.")
					: callbackPage("Sign-in didn't finish", "Return to Worksuite FrameFlow and try again."),
			);
			finish();
			if (ok) resolve({ code, redirectUri });
			else reject(new Error(error === "access_denied" ? "Sign-in was cancelled." : "Sign-in failed. Please try again."));
		});
		const finish = () => {
			clearTimeout(timer);
			server.close();
			pending = null;
		};
		pending = {
			cancel: (reason = "Sign-in was cancelled.") => {
				finish();
				reject(new Error(reason));
			},
		};
		timer = setTimeout(() => pending?.cancel("Sign-in timed out."), SIGN_IN_TIMEOUT_MS);
		server.on("error", (err) => {
			finish();
			reject(err);
		});
		server.listen(0, "127.0.0.1", () => {
			redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
			const authUrl = new URL(authorizationEndpoint);
			for (const [key, value] of Object.entries({ ...params, redirect_uri: redirectUri })) {
				authUrl.searchParams.set(key, value);
			}
			pending.url = authUrl.toString();
			// The authorize URL holds no secret (PKCE keeps the verifier here),
			// so the UI may show it for "Copy sign-in link".
			setState({
				signIn: {
					url: pending.url,
					startedAt: Date.now(),
					expiresAt: Date.now() + SIGN_IN_TIMEOUT_MS,
				},
			});
			shell.openExternal(pending.url);
		});
	});
}

async function signIn({ signup = false } = {}) {
	if (pending) pending.cancel("A new sign-in was started.");
	setState({ status: "signing-in", error: null });

	try {
		const { authorization_endpoint } = await getDiscovery();
		const verifier = base64url(crypto.randomBytes(32));
		const nonce = base64url(crypto.randomBytes(16));
		const { code, redirectUri } = await waitForCode({
			authorizationEndpoint: authorization_endpoint,
			params: {
				response_type: "code",
				client_id: CONFIG.clientId,
				scope: CONFIG.scope,
				state: base64url(crypto.randomBytes(16)),
				nonce,
				code_challenge: base64url(crypto.createHash("sha256").update(verifier).digest()),
				code_challenge_method: "S256",
				...(signup ? { prompt: "create", screen_hint: "signup" } : {}),
			},
		});

		const tokens = await tokenRequest({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier,
		});
		// The ID token comes straight from the token endpoint over TLS, so
		// checking its nonce, issuer and audience is enough (OIDC Core 3.1.3.7).
		const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
		if (claims) {
			const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
			if (claims.nonce !== nonce || claims.iss !== (await getDiscovery()).issuer || !aud.includes(CONFIG.clientId)) {
				throw new Error("Sign-in response could not be verified.");
			}
		}
		acceptTokens(tokens);
		const profile = await fetchProfile(claims);
		setState({ status: "signed-in", profile, error: null });
		return { ok: true };
	} catch (err) {
		const cancelled = /cancelled|new sign-in/.test(err.message);
		if (state.status === "signing-in") {
			setState({ status: "signed-out", error: cancelled ? null : err.message });
		}
		return { ok: false, error: err.message };
	}
}

function cancelSignIn() {
	pending?.cancel();
}

function reopenSignIn() {
	if (pending?.url) shell.openExternal(pending.url);
}

async function refresh() {
	// Offline mode (CL-09): keep the cached profile, make no requests.
	if (require("./network").isOffline()) return false;
	const refreshToken = memoryRefreshToken ?? loadRefreshToken();
	if (!refreshToken) return false;
	try {
		acceptTokens(await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }));
		const profile = await fetchProfile(null);
		setState({ status: "signed-in", profile, error: null });
		return true;
	} catch (err) {
		if (err.code === "invalid_grant") {
			// Revoked or expired: local work continues, the user is asked to sign in again.
			clearLocalSession();
			setState({ status: "expired", profile: null, error: null });
		}
		// Network or server errors keep the cached profile (offline use).
		return false;
	}
}

// Loads the cached profile instantly, then refreshes in the background so
// app start never waits on the network.
function init() {
	const cached = readJson(profileFile());
	// Profiles cached before workspaces existed have no workspace fields.
	const profile = cached && {
		workspaces: [],
		workspaceId: null,
		account: {
			plan: cached.plan ?? null,
			storageQuota: cached.storageQuota ?? null,
			storageUsed: cached.storageUsed ?? null,
		},
		...cached,
	};
	if (profile && fs.existsSync(tokenFile())) {
		setState({ status: "signed-in", profile });
		refresh();
	}
}

async function signOut() {
	const refreshToken = memoryRefreshToken ?? loadRefreshToken();
	clearLocalSession();
	setState({ status: "signed-out", profile: null, error: null });
	if (refreshToken) {
		try {
			const { revocation_endpoint } = await getDiscovery();
			if (revocation_endpoint) {
				await fetch(revocation_endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						client_id: CONFIG.clientId,
						token: refreshToken,
						token_type_hint: "refresh_token",
					}),
				});
			}
		} catch {}
	}
}

async function getAccessToken() {
	if (accessToken && Date.now() < accessTokenExpiresAt - 30_000) return accessToken;
	return (await refresh()) ? accessToken : null;
}

function getState() {
	return state;
}

function openManageAccount() {
	shell.openExternal(CONFIG.manageUrl);
}

module.exports = {
	init,
	signIn,
	cancelSignIn,
	switchWorkspace,
	workspaceHeaders,
	reopenSignIn,
	signOut,
	getState,
	getAccessToken,
	onChange,
	openManageAccount,
	apiBase: CONFIG.apiBase,
};
