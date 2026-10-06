# Original recording preparation on DEV

An explicit “Play original recording” request can prepare the reviewed English Mark 1:14–20 Step 1 recording, retain its verified original bytes in private DEV R2 storage, and play the selected instruction using its accepted excerpt range. Repeated requests share a durable job and reuse the stored original. Preparation becoming ready does not start playback automatically; the listener explicitly plays the ready recording.

The app verifies the passage, presentation revision, instruction text, result hash, source bytes, and range before playback. Restoring a session, changing passages, or leaving an activity does not create background playback. Existing release downloads and recording behavior are preserved.

Storage bindings and the Durable Object migration are DEV-only. Staging and production preparation are not activated by this change. The accepted eight ranges are previously reviewed artifacts; this increment does not provide arbitrary-passage transcription, alignment, generated fallback, or full-Mark dynamic media coverage.

Local validation passed source and client contract checks and actual Worker/SQLite/R2 cold acquisition and warm/restart reuse. The standard application, release, and CI gates remain required for the final composed candidate. Hosted DEV playback and reuse must be verified after activation before claiming hosted completion.
