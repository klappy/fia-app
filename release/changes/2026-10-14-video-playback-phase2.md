# Keep updated video playable

Network video now plays when its byte/hash identity changes, with a dismissible update notice. Video-only delivery revision skew and missing selected size fall back to the current manifest/default, with a size explanation. The active video is retained during a revision update.

Unsafe MIME, origin, redirects, incomplete/oversized bodies and cancellation still fail. Saved copies are verified strictly; corrupt copies fall back to network without being overwritten. Downloads, audio, images and source/presentation authority remain strict. A capped device-only log records media notices without full URLs or user identifiers.

This implements S3 phase 2, using the existing phase1 served-identity contract. Exact dependency/output pins are refreshed for review; original content/source/audio authority and the optional PR191/206 branches remain unchanged. Physical iPhone and deployed proof remain release-owner gates.
