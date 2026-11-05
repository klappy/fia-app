# Unavailable picture or map: the status card keeps its aspect and never scrolls

Follow-up to `unavailable-visual-stage.md` (#321).
- The bounded status card takes the record's own aspect when the record carries width and height, and keeps the 4:3 placeholder otherwise. Under the height cap it keeps that aspect instead of stretching wide.
- On short phones and at large text the card is floored at its own text, so it never becomes a small scrolling region or an unnamed keyboard stop. The step words keep their floor and stay first.

Tests: `apps/web/tests/media-stage.spec.js`, `e2e/visual.spec.js` (`manual-download-required`: glass ground, aspect, bounded height, Tab order, no scrolling card at 390×640, 390×560 and reading scale 1.5).
