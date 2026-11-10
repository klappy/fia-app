# Establish the first saved passage before reporting a verified download

A successful first passage Save now records an offline-start selection before the worker acknowledges the download. It preserves an existing selection and does not change the open page's client pin or switch media beneath loaded text. Explicit passage choices are serialized with first-Save initialization. A failed selection write, pause, or authority revocation before acknowledgement must not report success.

The automated regression starts with a passage-specific pack, sends no PACK_SELECT, then requires an offline navigation to return the saved shell and pin the new client. It also covers text-only Save, selected old-copy carryover, an explicit choice during Save, a second saved passage, and interrupted selection storage.

## Limits and release qualification

- The installed candidate must handle the Save. Saves still handled by an older worker remain exposed.
- Installing the candidate alone does not repair an older unselected copy. The existing explicit-selection or later online status path still selects it.
- Saving a second passage preserves an existing offline selection. Invalid or stale existing selections are not repaired by this change.
- Prior controlled local probes passed synthetic-audio worker cases and full-app text-only saves. They are not proof of real facilitator audio/images/maps or a production-build-to-candidate full application upgrade.
- No physical phone was used. Full ticket acceptance, exact-head independent review, and the required application/worker upgrade checks remain release prerequisites.
- This feature is independent of #368, which remains held. No staging or production promotion is authorized by this change.
