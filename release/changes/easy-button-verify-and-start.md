# Easy button checks first, starts once, and only offers real recordings

While a passage's availability is being checked, the easy button shows no icon and no label: the disc dims and breathes softly (static under reduced motion), its accessible name is "Checking availability" and it is marked busy. It then changes once, to the checked action. A tap while it checks waits and then performs the checked Play or Begin once; a tap that would only advance is dropped. A check that cannot finish ends after 4 s and shows what is known; later answers still apply.

From an accepted Play or Begin until sound, the centre keeps one starting face (the design-book loading row: dimmed, spinner, the label it will have). Repeated taps in that start, and for 800 ms after the last one, never cancel, pause or skip. The centre never becomes Continue or Cancel mid-start; cancel is the labelled control beside it. "Recording ready. Press Play to listen." no longer shows while a requested playback is being carried through.

Play is offered only where a recording can be played or the reviewed catalog admits its preparation. Other screens show no enabled Play and send no preparation request. Navigation no longer marks an admitted screen as a silent hold, so Back, reload and reopen offer Begin or Play in the centre. A discussion hold after the recording finishes stays Continue, with no Play beside it.

Validation: new App-boundary tests for the face sequence, queued taps, tap bursts, carried preparation and R6 offers; a unit test for the tap gate; and a Playwright spec for the load guard (checking, then one verified state, no uncaused change) and the six-taps-150-ms hammer. Existing tests that encoded the replaced behaviour were updated in place.
