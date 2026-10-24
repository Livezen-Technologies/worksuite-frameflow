/** A Canvas 2D stand-in that records every call (for determinism hashes). */
export function recordingContext() {
	const log: string[] = [];
	const state: Record<string, unknown> = { font: "10px sans-serif", letterSpacing: "0px" };
	const fontSize = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
	const gradient = () => ({ addColorStop: (o: number, c: string) => log.push(`stop ${o.toFixed(3)} ${c}`) });
	const target: Record<string, unknown> = {
		measureText: (s: string) => ({ width: Array.from(s).length * fontSize() * 0.5 }),
		createLinearGradient: (...a: number[]) => {
			log.push(`grad ${a.map((v) => v.toFixed(2)).join(",")}`);
			return gradient();
		},
		roundRect: (...a: number[]) => log.push(`roundRect ${a.map((v) => v.toFixed(2)).join(",")}`),
	};
	const ctx = new Proxy(target, {
		get(t, key: string) {
			if (key in t) return t[key];
			if (key in state) return state[key];
			return (...args: unknown[]) => {
				log.push(`${key}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : JSON.stringify(a))).join(",")})`);
			};
		},
		set(_t, key: string, value) {
			state[key] = value;
			log.push(`${key}=${typeof value === "number" ? value.toFixed(3) : typeof value === "object" ? "[obj]" : String(value)}`);
			return true;
		},
		has(_t, key: string) {
			return key === "letterSpacing" || key === "roundRect" || key in target;
		},
	});
	return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

export function hashLog(log: string[]): string {
	let h = 0x811c9dc5;
	for (const line of log) for (let i = 0; i < line.length; i++) h = Math.imul(h ^ line.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(16);
}
