# Multiple original guide recordings in one passage

Scope: replace twelve Step2 generated guide units using the existing recorded-guide range mechanism, preserving Step1 and official BSB. No player redesign, new generation or source-text changes.

Keep the existing `recordingLedger` default for backward compatibility. Add optional `recordingLedgers`, a nonempty array of distinct hash-pinned ledger references. An audio replacement may carry `recordingLedgerSha256`; absent means the existing default. It must resolve to exactly one declared ledger. Each ledger retains its own recording, raw transcript, script/drift review and ordered ranges. Finalization validates the selected ledger per entry and includes all referenced ledger files in offline core. Reject undeclared/duplicate/unused additional ledgers. Existing SW file-level recordingLedgerSha256 continues binding saved bytes/ranges without a new runtime protocol.

Recognized-word evidence may contain a zero-duration point estimate (`endSeconds == startSeconds`), as actual ASR does. Preserve it unchanged as uncertainty; never synthesize a positive interval or imply word highlighting from it. Reject negative/reversed/nonfinite timestamps, unordered starts or timestamps outside the source duration. Playback ranges remain strictly positive, ordered, source-bound and contain all selected word estimates. This guide capability supplies unit ranges, not Scripture word highlights.

Step2 source SHA80caf8ea6128568075c71f0e1724d65d2dc877083969df7310ee1a1dd71ebafc. Current user-visible final unit S02-U013 candidate source range429.48–495.50; all12 source candidates are in the hash-pinned review. Delivery mapping must be measured on actual proxy bytes before publication. Preserve raw ASR and drift, no claimed certified transcript.

No U012 activity exists in the approved app. Preserve the U011 manual hold; do not append the recording's separate pause prompt to U013 or claim complete recording coverage. Other manual discussion and Scripture handoffs remain unchanged.

Tests: retain Step1+Step2 distinct recording joins; reject wrong/unknown ledger, duplicate or unused references; accept preserved zero-duration ASR point but reject negative/reversed evidence; enforce positive playback range/containment; verify offline core contains both ledger dependencies. Actual browser must play current S02-U013 from the official recording and stop at the measured endpoint, plus check selected Step2 ranges and manual hold. No publication readiness inferred from fixture tests.
