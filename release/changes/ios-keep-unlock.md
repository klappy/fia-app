# iOS: a finished clip no longer empties the one audio element

Review of the iOS start fix (Bugbot on #205) found that releasing a clip still emptied the shared element's source and called `load()`: the teardown from when each clip had its own element. On WebKit that empty load may return the element to locked, so a later screen's untapped start would hang again until the 1.5 s bound turned it into Resume. Releasing a clip now only pauses the element; the next clip's source swap reloads it, and stale media events stay ignored by the generation check.

Not changed: the start bound, the unlock on the first tap, and range seeking. A released element keeps its last source until the next clip replaces it. Whether WebKit relocks on an empty load is not measured on a device; the iOS emulation now takes the stricter reading.

Validation: `e2e/fixtures/ios-playback.js` gains `loadResets` (default on): a `load()` on an audio element left with no source returns it to locked. With it, both `e2e/ios-playback.spec.js` tests fail against the build before this change (screens 2 and 3 never start after one tap) and pass with it. Two unit tests that checked the emptied source now check that the element is paused and the controller released.
