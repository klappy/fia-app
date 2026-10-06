# Keep source transfers outside retried transactions

The known-source acquisition executor now finishes its durable ownership check before invoking publisher fetch or R2 upload. A transaction callback retry therefore cannot duplicate a transfer or consume the same stream twice. It also rechecks cancellation before dispatch.

The regression deliberately replays transaction callbacks with rolled-back first writes and verifies one publisher GET and one upload consumption, plus stale and aborted ownership checks. It runs in the required Worker test gate. This addresses Bugbot's medium finding on PR171; no incident in the separately verified public P2 path was established, and no automatic retry or new provider activation is added.
