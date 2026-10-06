# Verified fresh originals to request preparation

This private composition joins reviewed source observation, request acquisition and
optional coherent snapshot refresh in one shared durable storage and R2 scope.
There is no public admission/ACL, scheduler, ASR activation or accepted-output
builder. Callers must supply trusted source-check tickets and snapshot admission.

`observe(checkId)` is the only bridge operation that may fetch the publisher, and
only according to the captured freshness capability's ticket policy. `request`
verifies the current eligible observation, matches full logical selection and
literal guide URL, derives a known-source pin from verified bytes, and acquires
from the immutable original. Its downstream publisher callback always throws:
missing/corrupt originals do not silently cause a second network request. A final
verified observation read refuses revocation, corruption or supersession during
work. Recognition remains explicitly unavailable.

This increment supports discovery-snapshot provenance only. The version must equal
the selected presentation revision. Publisher-version provenance requires a future
trusted mapping and is refused, never relabeled. The original observation receipt
is returned intact, separately from preparation and `acceptedPlayback:false`.

Optional `demand(request, {sequence, expectedPreviousObservationSha256})` constructs
the desired snapshot identity from selected source/script/full recognition recipe
and captured alignment/delivery/acceptance configuration. The caller's snapshot
sequence and prior hash belong to the snapshot domain; the freshness receipt hash
is never substituted for them. Its observation provenance comes from the verified
fresh receipt. Same actual dependencies retain the existing refresh, including a
blocked refresh; no unsupported automatic retry is introduced.

The bridge installs a captured observation guard in the snapshot coordinator.
Inside the SAME storage transaction as admission and final promotion, the guard
checks current fresh-head schema, logical ID, receipt hash/key, sequence, source
hash and byte length against the already verified observation. It performs only a
local transaction read. All these capabilities must share the same durable object
storage; a different storage instance cannot supply this atomicity contract.
The generic optional guard must be trusted, read-only and bounded local work;
external I/O is forbidden inside it because transaction callbacks may replay.
Promotion rechecks its deadline after awaiting the guard. Admission retains the
coordinator's existing local-storage timing contract before its phase deadline.

Tests use retained P2 bytes with synthetic routing and a synthetic previously
accepted graph. A one-byte altered fixture tests dependency invalidation only, not
valid audio decoding or acoustic acceptance. Actual SQLite/R2 verifies explicit
fresh fetch, downstream reuse, preserved prior snapshot and offline restart with
zero new fetches. Unit races cover a newer fresh head before snapshot admission,
corrupt head fields, disappearance after verified read, same/changed bytes,
revocation and Buffer mutation. Generic guard tests cover final-promotion changes
and deadline expiry. New playback acceptance and full hosted coverage remain open.
