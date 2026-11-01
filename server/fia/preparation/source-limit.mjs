// One received-byte ceiling for lazily acquired publisher audio originals. It bounds the literal
// acquisition (original.mjs), the pinned R2 source record (source-store.mjs) and catalog-row
// guide dispatch admission (guide-dispatch.mjs); a source above it fails closed at each of them.
// 8 MiB is sized from the measured Mark 1:14-20 publisher guide sources: S05 7,241,950 B (largest,
// 86% of the ceiling), S02 6,981,934 B, S03 4,060,942 B, S04 2,933,515 B (fia-app-cookbook
// RESULTS-S02-S06-GUIDE-AUDIO-ADMISSION-2026-11-01.md). The 30 s acquisition deadline is unchanged
// and still covers the whole body. A whole source is buffered, hashed and written once, so peak
// memory stays a small multiple of 8 MiB. The streamed guide adapter already bounds sources at
// 8 MiB and visual originals use 12 MiB in the same bucket and Durable Object; the
// fresh-source-observation primitive caps every policy at 16 MiB.
export const LAZY_ORIGINAL_MAX_BYTES=8*1024*1024;
