# One bar with six stage icons; listen is an ear, discuss is people, a key term is a key

The session bar is one control carrying the six FIA stage icons (Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word): visited cells filled, the current cell ringed, the stage name and step number under it. The per-screen icon row that sat beneath the stage segments is gone from the bar; a reader in the 10/07 Alpha review took it for part of the six segments. Position inside the stage lives in the overview (tap the bar) and in the spoken words, which now follow the design book: the stage name, the step, `unit n of m`, then `more ahead` or `last unit`, or `complete` once the session is done. The words sit in a visually hidden progressbar outside the button and are linked by `aria-describedby`, because a button's accessible name would otherwise hide them.

The icon vocabulary changed with it. Listening is an ear (the speaking face read as *speaking*); a discussion is two people; a key term is a key. The stage set is heart, mountain, layers, drama, puzzle and speech, chosen so no stage glyph is also a content glyph; the spec `apps/web/tests/progress-icons.spec.js` asserts that. The overview sheet and section transitions pick the new glyphs up unchanged.

Ruling: the captain adopted the design-book entries as mocked on 2026-10-08 (cookbook `design/alpha-system/components/progress-rail.md § One bar`, `tokens.md § Icon vocabulary`; cookbook #234, #235), with the word that the team iterates after seeing it fully implemented. App PRs #210 and #211; independent review YES on both.

Not changed: the overview sheet's layout, the primary control, the dock and menu, every sheet. Sizes follow the mock (20 px glyph in a 32 px cell, 2 px track) rather than the entry's stated 24/6; a large-print variant is not yet drawn.

Validation: `app.spec.js` 99/99 and `progress-icons.spec.js` 3/3 locally; a 390 px screenshot of the built app shows the bar in the real chrome. Visible parity: every state that shows the session bar is an authorized changed state for this candidate (the bar is the authorized change), recorded as new-state evidence with independent visual review required; sheet-only states keep parity.

Not covered: a persona P-01 run on DEV naming stage and position after looking away; the large-print form; whether a quiet `n of m` word under the bar is wanted once the beads are gone (design-book open item 1).
