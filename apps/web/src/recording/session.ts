/**
 * One clock for a recording session (SRS SC-40, SC-42): every track is timed
 * against it, pause stops it for all tracks at once, and markers (SC-36) are
 * stored in recorded time.
 */
export class SessionClock {
	private startedAt: number | null = null;
	private pausedAt: number | null = null;
	private pausedTotal = 0;

	constructor(private readonly now: () => number = () => performance.now()) {}

	start(): void {
		this.startedAt = this.now();
		this.pausedAt = null;
		this.pausedTotal = 0;
	}

	pause(): void {
		if (this.startedAt !== null && this.pausedAt === null) {
			this.pausedAt = this.now();
		}
	}

	resume(): void {
		if (this.pausedAt === null) return;
		this.pausedTotal += this.now() - this.pausedAt;
		this.pausedAt = null;
	}

	get paused(): boolean {
		return this.pausedAt !== null;
	}

	/** Recorded seconds so far, not counting pauses. */
	elapsed(): number {
		if (this.startedAt === null) return 0;
		const end = this.pausedAt ?? this.now();
		return Math.max(0, (end - this.startedAt - this.pausedTotal) / 1000);
	}
}

export function formatDuration(seconds: number): string {
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
	return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
