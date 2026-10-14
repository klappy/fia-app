# Video playback worker: tolerate updated MP4 identity

Network video can play when its byte/hash identity changes, with bounded local diagnostic notes. Video-only delivery revision skew and missing size now fall back to the current manifest/default. Unsafe MIME, origin, redirects, incomplete/oversized bodies and cancellation still fail. Saved copies are verified strictly; corrupt copies fall back to network without being overwritten. Downloads, audio, images and source/presentation authority remain strict.

This is the worker portion of S3 phase 2. The page's missing-size fallback and visible update notice remain a coordinated integration dependency (App.svelte is held by PR191). It does not claim full S3 completion, iPhone validation or deployment. Release closure pin reconciliation is required before the packaging gate can pass.
