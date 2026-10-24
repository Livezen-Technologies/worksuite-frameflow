#!/usr/bin/env python3
"""Synthesises the Worksuite Assets sound effects from code (no samples).

    python3 scripts/assets/build-sounds.py

Writes 48 kHz, 16-bit mono WAVs to assets/worksuite-pack/sounds/. Output is
deterministic (fixed random seed), so rebuilding gives byte-identical files.
Each sound is peak-normalised to -3 dBFS.
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
PEAK_DBFS = -3.0
OUT = Path(__file__).resolve().parents[2] / "assets" / "worksuite-pack" / "sounds"
TAU = 2 * math.pi


def n(sec):
    return int(round(sec * RATE))


def env_exp(i, tau_sec):
    return math.exp(-i / (tau_sec * RATE))


def fade_edges(buf, fade_in=0.001, fade_out=0.004):
    a, b = n(fade_in), n(fade_out)
    for i in range(min(a, len(buf))):
        buf[i] *= i / a
    for i in range(min(b, len(buf))):
        buf[-1 - i] *= i / b
    return buf


def lowpass(buf, cutoff):
    """One-pole low-pass; `cutoff` may be a number or a function of the sample index."""
    out, y = [], 0.0
    for i, x in enumerate(buf):
        fc = cutoff(i) if callable(cutoff) else cutoff
        a = 1 - math.exp(-TAU * fc / RATE)
        y += a * (x - y)
        out.append(y)
    return out


def highpass(buf, cutoff):
    low = lowpass(buf, cutoff)
    return [x - l for x, l in zip(buf, low)]


def tick(length, freq, decay, noise_amt, rng):
    out = []
    for i in range(n(length)):
        t = i / RATE
        e = env_exp(i, decay)
        out.append(e * (math.sin(TAU * freq * t) * (1 - noise_amt) + (rng.uniform(-1, 1)) * noise_amt))
    return highpass(out, 900)


def click(rng):
    # Two-part mouse click: a sharp press tick, then a softer release tick.
    total = [0.0] * n(0.060)
    for start, freq, decay, amp in ((0.000, 4200, 0.0022, 1.0), (0.026, 3300, 0.0030, 0.55)):
        part = tick(0.024, freq, decay, 0.55, rng)
        o = n(start)
        for i, x in enumerate(part):
            if o + i < len(total):
                total[o + i] += amp * x
    return total


def pop(rng):
    # A short rising-then-falling "bloop" with a tiny noise transient.
    out = []
    phase = 0.0
    for i in range(n(0.120)):
        t = i / RATE
        f = 380 + 900 * math.exp(-t / 0.018) + 260 * (t / 0.12)
        phase += TAU * f / RATE
        e = (1 - math.exp(-t / 0.002)) * math.exp(-t / 0.035)
        out.append(e * math.sin(phase) + (rng.uniform(-1, 1) * 0.25 * math.exp(-t / 0.003)))
    return out


def ding(rng):
    # A soft bell: inharmonic partials with individual decays.
    partials = ((1.0, 1.0, 0.30), (2.76, 0.45, 0.16), (5.40, 0.22, 0.08), (8.93, 0.10, 0.05), (2.0, 0.25, 0.22))
    f0 = 1046.5
    out = []
    for i in range(n(0.600)):
        t = i / RATE
        s = 0.0
        for ratio, amp, decay in partials:
            s += amp * math.exp(-t / decay) * math.sin(TAU * f0 * ratio * t)
        out.append(s * (1 - math.exp(-t / 0.0015)))
    return out


def whoosh(rng):
    # Noise through a low-pass whose cutoff sweeps up then down, with a swell envelope.
    length = n(0.350)
    noise = [rng.uniform(-1, 1) for _ in range(length)]
    cutoff = lambda i: 300 + 5200 * math.sin(math.pi * i / length) ** 2
    filtered = lowpass(lowpass(noise, cutoff), cutoff)
    filtered = highpass(filtered, 150)
    return [x * math.sin(math.pi * (i / length)) ** 1.5 for i, x in enumerate(filtered)]


def confetti(rng):
    # A shimmer: many tiny, high, randomly placed sine pings.
    length = n(0.500)
    out = [0.0] * length
    for _ in range(70):
        start = int(rng.random() ** 1.4 * (length - n(0.08)))
        freq = rng.uniform(3000, 9000)
        amp = rng.uniform(0.3, 1.0) * (1 - start / length * 0.6)
        decay = rng.uniform(0.010, 0.030)
        for i in range(n(0.08)):
            t = i / RATE
            out[start + i] += amp * math.exp(-t / decay) * math.sin(TAU * freq * t) * (1 - math.exp(-t / 0.0008))
    return out


SOUNDS = {"click": click, "pop": pop, "ding": ding, "whoosh": whoosh, "confetti": confetti}


def write(name, buf):
    buf = fade_edges(list(buf))
    peak = max(abs(x) for x in buf) or 1.0
    gain = 10 ** (PEAK_DBFS / 20) / peak
    frames = b"".join(struct.pack("<h", max(-32767, min(32767, int(round(x * gain * 32767))))) for x in buf)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    return len(buf) / RATE


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in SOUNDS.items():
        rng = random.Random(f"worksuite-{name}")
        sec = write(name, make(rng))
        print(f"{name}.wav  {sec * 1000:.0f} ms")


if __name__ == "__main__":
    main()
