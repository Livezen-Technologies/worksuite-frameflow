// Diagnoses Worksuite Cloud sign-in for the desktop app (diagnosis only):
// OpenID discovery at likely issuers, and whether the authorize endpoint
// accepts the app's client id with a loopback redirect.
//   node scripts/assets/probe-auth.mjs
const CLIENT_ID = process.env.WSC_CLIENT_ID || "worksuite-frameflow";
const issuers = [
	"https://accounts.worksuitecloud.com",
	"https://auth.worksuitecloud.com",
	"https://worksuitecloud.com",
	"https://id.worksuitecloud.com",
	"https://login.worksuitecloud.com",
	"https://api.worksuitecloud.com",
	"https://frameflow.worksuitecloud.com",
];
const show = (s) => JSON.stringify(String(s).slice(0, 160));
for (const issuer of issuers) {
	const url = `${issuer}/.well-known/openid-configuration`;
	try {
		const res = await fetch(url, { redirect: "manual" });
		const text = await res.text();
		console.log(`${res.status} ${res.headers.get("content-type")} ${url} ${show(text)}`);
		if (!res.ok || !/json/.test(res.headers.get("content-type") ?? "")) continue;
		const d = JSON.parse(text);
		console.log(`  issuer ${d.issuer}\n  authorize ${d.authorization_endpoint}\n  token ${d.token_endpoint}\n  device ${d.device_authorization_endpoint ?? "-"}\n  pkce ${d.code_challenge_methods_supported} prompts ${d.prompt_values_supported ?? "-"}`);
		const a = new URL(d.authorization_endpoint);
		for (const [k, v] of Object.entries({ response_type: "code", client_id: CLIENT_ID, scope: "openid profile email offline_access", redirect_uri: "http://127.0.0.1:53682/callback", state: "probe", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" })) a.searchParams.set(k, v);
		const r = await fetch(a, { redirect: "manual" });
		const body = await r.text();
		console.log(`  authorize → ${r.status} location ${r.headers.get("location") ?? "-"} ${show(body)}`);
	} catch (error) {
		console.log(`ERR ${url} ${error.cause?.code ?? error.message}`);
	}
}
for (const url of ["https://worksuitecloud.com/signup", "https://worksuitecloud.com/register", "https://worksuitecloud.com/login", "https://worksuitecloud.com/account"]) {
	try {
		const r = await fetch(url, { redirect: "manual" });
		console.log(`${r.status} ${url} location ${r.headers.get("location") ?? "-"}`);
	} catch (error) {
		console.log(`ERR ${url} ${error.cause?.code ?? error.message}`);
	}
}

// Download center feeds the app's updater reads.
const feedUrls = [];
for (const channel of ["stable", "beta"]) for (const file of ["latest.yml", "latest-mac.yml", "latest-linux.yml"]) feedUrls.push(`https://download.worksuitecloud.com/frameflow/${channel}/${file}`);
for (const extra of ["frameflow/latest-mac.yml", "frameflow/latest.yml", "latest-mac.yml", "frameflow", "frameflow/", "api/frameflow/latest", "frameflow/beta/", "frameflow/stable/"]) feedUrls.push(`https://download.worksuitecloud.com/${extra}`);
feedUrls.push("https://worksuitecloud.com/download/frameflow");
{
	for (const url of feedUrls) {
		try {
			const r = await fetch(url);
			const text = await r.text();
			console.log(`${r.status} ${r.headers.get("content-type")} ${url} ${/^version:/m.test(text) ? JSON.stringify(text.slice(0, 400)) : show(text.replace(/\s+/g, " ").slice(0, 300))}`);
		} catch (error) {
			console.log(`ERR ${url} ${error.cause?.code ?? error.message}`);
		}
	}
}
