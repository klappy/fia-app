# Window recognition guide composition

`createWindowGuideRecognition` is an explicitly trusted, free execution port for `createGuideExecutor`. Its `resultSchema` is `fia-window-guide-recognition@1`; an absent marker retains the existing single-recording contract and dependency identity. Other markers refuse before acquisition. Deployment and recognition capabilities remain absent by default.

The adapter receives acquired bytes through `artifacts.read`, verifies their SHA, then calls `prepare({input, source, sourceBytes, signal})`. That trusted decoder port must return the measured `pcmSha256`, `decoderSha256`, `totalSamples`, and `sampleRate:16000`. The recognition port is the existing window executor's `{paid:false, dependencySha256, run({planIdentity,window,signal})}` interface. Its dependency pin must bind the exact model, runtime, script, language and effective configuration; the outer adapter pin additionally binds decoder/window policy and storage/port authority. Pins are supplied by reviewed composition, never inferred from callback source.

The aggregate binds language/model recipe and actual acquired source bytes, preserving source-level recognition reuse across consumers. Every retained raw window is rehashed, bound to the canonical plan and runtime receipt, and reprojected on verification, including warm factory reuse. Limits are 32 windows, 4 MiB per raw JSON and 16 MiB combined raw JSON. The original source reader remains at 8 MiB, and the current observed acquisition path remains 2 MiB. Window planning does not remove those acquisition limits or qualify longer sections.

Consumer-specific output uses distinct `fia-window-guide-correspondence@1` and `fia-window-guide-review@1` schemas. All canonical units remain unmatched/review-required. Raw words and competing overlap traces remain in the retained aggregate. No single-recording raw artifact, word mapping, accepted range, playback permission or publication is fabricated. Even a projection without overlapping words requires a separately reviewed correspondence and quality policy.

The factory propagates an AbortSignal to this typed adapter and aborts it at its bounded step deadline. Trusted ports must honor cancellation; a timeout does not prove a process stopped. Durable window claims and the outer pipeline retain uncertainty without automatic retry. A late orphan artifact cannot complete a failed outer pipeline attempt. No public activation or hosted model is added here.

Tests use synthetic raw window controls with genuine retained guide metadata/presentation. Actual local model/Worker integration evidence is recorded separately; synthetic fixture results are not model quality evidence.

## Optional typed source preparation

If either `artifacts.verifySource` or `artifacts.openSource` is supplied, both are required and there is no fallback to `artifacts.read(source)`. The verifier receives the exact acquired descriptor with `{maxBytes:sourceMaxBytes,signal}` and must return exactly `{sha256,reference,bytes}`. The adapter checks all returned pins and any known acquired byte count. The trusted preparation callback receives `{input,source,openSource,maxBytes,signal}` without `sourceBytes`; connect it to `decodeStream` so producer verification completes before decoding. `sourceMaxBytes` defaults to 2 MiB and permits an explicit trusted value up to 16 MiB. The outer dependency pin must bind this source policy and typed port authority.

Without typed ports, the existing byte preparation path remains unchanged. This consumer branch does not install the producer, change dispatcher policy, or fetch missing source bytes; production composition is separately reviewed. JSON artifact limits and unresolved/review-required semantics are unchanged.
