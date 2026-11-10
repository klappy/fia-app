# Audio range audit (partial, diagnostic)

Checks every reviewed guide `playbackRange` of a pack against what is actually spoken in the delivered
(Opus) audio, using word timings from any ASR (faster-whisper `small.en`/`base.en` was used). It adds no
runtime path and changes no content. See `audit.py` for inputs.

Result for `eng.MRK-1-1-13` (live 3.0.0-alpha.20+98a0261, manifest 9c8592c7…, 112 ranged units):

{'ok': 103, 'asr-gap': 1, 'drift': 3, 'cut': 5}

Reading it honestly: the ranges are in the delivered clock (manifest timing mapping scale 1, offset 0, sha-verified) and the
BSB alignment word starts sit within ~0.2 s of ASR word starts (median -0.18 s), so no systematic clock offset was found.
The residual `cut`/`drift`/`asr-gap` rows are mostly ASR word-timestamp noise (adjacent units share a boundary word) or ASR
dropping long stretches of audible speech, so they are leads to listen to, not proven defects. This PR does **not** claim to
fix the reported out-of-sync audio; it records what was measured and leaves a repeatable tool.
