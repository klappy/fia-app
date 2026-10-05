# Standalone unit evidence diagnostics

`assessUnitQualityEvidence({alignment, signal?, browser?, sourceSha256, rawRecognitionSha256, guideScriptSha256, resolveArtifact})` resolves content-addressed JSON descriptors (`sha256`, `reference`) through an injected read adapter and hashes actual bytes. It reports the current alignment, signal and browser measurement schemas only. It performs no acquisition, recognition or publication.

Signal geometry, measured quiet-run margins, input identities and browser cut/trial membership are checked per unit. `guideScriptSha256` is content identity; the signal's `scriptSha256` is the measurement program hash and is separately reported. Measured signal and measured browser trials do not establish calibrated recognition, qualified native clock mapping or accepted ranges. A caller-supplied true qualification flag is unsupported. All output accepted-range arrays remain empty; there is no acceptance/trust API.

A blocked unit does not erase valid measurements for another unit. Shared artifact hash/identity failures block that artifact for every dependent unit. Numeric comparisons use 1e-8 solely for JSON arithmetic consistency, never as a timing-quality tolerance. This module does not qualify landmark uniqueness, confidence, phonetics, playback safety or highlighting. Even a fully measured unit remains native-clock-unqualified and recognition-uncalibrated.

Pipeline integration is deliberately deferred: alignment/signal/browser hashes and report recipe identity must become explicit node/cache inputs before any integration. Reading new evidence behind an unchanged acceptance-node key would create a stale hidden dependency. The existing acceptance adapter and pipeline are untouched.

Run `node --test tests/preparation-executor/quality-evidence.test.mjs`. A bounded read of retained p3 artifacts reports three units with signal measured and browser measured-unqualified, five blocked signal units, no accepted ranges. This is local diagnostic evidence, not independent acceptance or a hosted result.
