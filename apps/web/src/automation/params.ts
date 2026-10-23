/** Small validators for automation parameters; errors use JSON-RPC's invalid-params code. */

export class AutomationError extends Error {
	readonly code: number;
	constructor({ message, code = -32000 }: { message: string; code?: number }) {
		super(message);
		this.code = code;
	}
}

const invalid = (message: string) =>
	new AutomationError({ message, code: -32602 });

export function asRecord(params: unknown): Record<string, unknown> {
	if (params === undefined || params === null) return {};
	if (typeof params !== "object" || Array.isArray(params))
		throw invalid("params must be an object");
	// Checked just above.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return params as Record<string, unknown>;
}

export function str({
	params,
	key,
	required = false,
}: {
	params: Record<string, unknown>;
	key: string;
	required?: boolean;
}) {
	const v = params[key];
	if (v === undefined || v === null || v === "") {
		if (required) throw invalid(`${key} is required`);
		return undefined;
	}
	if (typeof v !== "string") throw invalid(`${key} must be a string`);
	return v;
}

export function num({
	params,
	key,
	min = -Infinity,
	max = Infinity,
}: {
	params: Record<string, unknown>;
	key: string;
	min?: number;
	max?: number;
}) {
	const v = params[key];
	if (v === undefined || v === null) return undefined;
	if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
		throw invalid(`${key} must be a number between ${min} and ${max}`);
	return v;
}

export function oneOf<T extends string>({
	params,
	key,
	values,
}: {
	params: Record<string, unknown>;
	key: string;
	values: readonly T[];
}): T | undefined {
	const v = params[key];
	if (v === undefined || v === null) return undefined;
	const found = values.find((x) => x === v);
	if (!found) throw invalid(`${key} must be one of ${values.join(", ")}`);
	return found;
}
