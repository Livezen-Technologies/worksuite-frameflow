const crypto = require("node:crypto");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

/**
 * gRPC front for the automation API (SRS AU-01, "gRPC behind feature flag"):
 * listens on 127.0.0.1 only, port 7521 by default, and needs the same token
 * as the JSON-RPC socket. Methods and events come from automation.js.
 */

const DEFAULT_PORT = 7521;
const STATUS = { "-32601": grpc.status.NOT_FOUND, "-32602": grpc.status.INVALID_ARGUMENT, "-32001": grpc.status.UNAVAILABLE };

const definition = protoLoader.loadSync(path.join(__dirname, "automation.proto"), { keepCase: true, defaults: true });
const { Automation } = grpc.loadPackageDefinition(definition).wve.automation.v1;

function authorized({ metadata, token }) {
	const header = String(metadata.get("authorization")[0] ?? "");
	const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
	const want = Buffer.from(token ?? "");
	return want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

const fail = (code, details) => Object.assign(new Error(details), { code, details });

/**
 * Starts the server. `dispatch(method, params)` runs a method; `subscribe(topics,
 * send)` registers an event sink and returns its unsubscribe function.
 */
async function startGrpc({ token, dispatch, subscribe, topics: known, port = DEFAULT_PORT }) {
	const server = new grpc.Server();
	server.addService(Automation.service, {
		Call(call, callback) {
			if (!authorized({ metadata: call.metadata, token: token() }))
				return callback(fail(grpc.status.UNAUTHENTICATED, "Send the token from automation.json as authorization: Bearer <token>"));
			let params;
			try {
				params = call.request.params_json ? JSON.parse(call.request.params_json) : {};
			} catch {
				return callback(fail(grpc.status.INVALID_ARGUMENT, "params_json isn't valid JSON"));
			}
			Promise.resolve()
				.then(() => dispatch(String(call.request.method), params))
				.then((result) => callback(null, { result_json: JSON.stringify(result ?? null) }))
				.catch((error) => callback(fail(STATUS[String(error.rpcCode)] ?? grpc.status.INTERNAL, error.message)));
		},
		Subscribe(call) {
			if (!authorized({ metadata: call.metadata, token: token() })) {
				call.emit("error", fail(grpc.status.UNAUTHENTICATED, "Send the token from automation.json as authorization: Bearer <token>"));
				return;
			}
			const wanted = call.request.topics.length ? call.request.topics.map(String) : ["*"];
			const unknown = wanted.filter((t) => t !== "*" && !known.includes(t));
			if (unknown.length) {
				call.emit("error", fail(grpc.status.INVALID_ARGUMENT, `Unknown topics: ${unknown.join(", ")}`));
				return;
			}
			const off = subscribe(new Set(wanted), ({ topic, data, at }) =>
				call.write({ topic, data_json: JSON.stringify(data ?? null), at }),
			);
			call.on("cancelled", off);
			call.on("close", off);
			call.on("error", off);
		},
	});
	const bound = await new Promise((resolve, reject) =>
		server.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (error, p) => (error ? reject(error) : resolve(p))),
	);
	return {
		address: `127.0.0.1:${bound}`,
		stop: () => new Promise((resolve) => server.tryShutdown(() => resolve())),
	};
}

module.exports = { startGrpc, DEFAULT_PORT };
