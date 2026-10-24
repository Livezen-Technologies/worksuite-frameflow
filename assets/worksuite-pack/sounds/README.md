# Worksuite Assets sounds

Original sound effects for the Worksuite Assets pack, synthesised entirely from code by
[`scripts/assets/build-sounds.py`](../../../scripts/assets/build-sounds.py) (Python standard library, fixed
seeds, no recorded or downloaded samples). Licence: MIT, like the rest of the repository.

| File | Length | Sound |
| --- | --- | --- |
| `click.wav` | 60 ms | Two-part mouse click (press + release tick) |
| `pop.wav` | 120 ms | Button pop-in |
| `ding.wav` | 600 ms | Soft notification bell with decay |
| `whoosh.wav` | 350 ms | Slide-in, swept filtered noise |
| `confetti.wav` | 500 ms | Sparkly shimmer |

All are 48 kHz, 16-bit mono WAV, peak-normalised to −3 dBFS. Rebuild with `python3 scripts/assets/build-sounds.py`
(the output is byte-identical each time). Animations reference them from `asset.json` → `sounds`.
