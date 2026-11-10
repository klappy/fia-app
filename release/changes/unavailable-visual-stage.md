# Unavailable picture or map keeps the step's words (PR318 design HOLD)

Correction slice in train N (#321 into `integration/2026-10-29-text-resources-n`) for the independent design-lens HOLD on #318: at a picture or map that cannot be shown, the guided stage no longer becomes a full-height grey panel with one line and no prompt.

- The step's own guide text (for Mark 1:14–20 S02-U008, "Stop here and look at a map of the Galilee area and a picture of the Sea of Galilee as a group…") stays in the content band as a keyboard-focusable, labelled scroll region; the derived map stop S02-U008-resource-c4 shows the prompt its record carries. Nothing is invented and no passage text is promised.
- The note moves into a bounded `role="status"` region in the media slot (4:3 placeholder; the height cap governs on wide screens). It reads "This image is unavailable here. You can continue without it." ("map" for maps); offline, loading, failed and canceled keep their own wording. While the device check runs, the region stays silent and shows the existing "Checking availability" face, so a restore never announces a false "unavailable".
- Captions read "FIA Images · CC BY-SA 4.0" / "FIA Maps · CC BY-SA 4.0" instead of collection ids.
- The shared renderer applies the same state to every pack, including Mark 1:1–13's picture stops. A shown picture, a text-only step and a resource detour are unchanged.

Not in this slice: visual bytes (F7–F9), the narration-blocked and offline notice placement (cookbook `work/queued/2026-11-03-narration-blocked-toast-overlap`), the record-aspect plumbing (follow-up PR after DEV).

Tests: `apps/web/tests/media-stage.spec.js`, `apps/web/tests/app.spec.js`, `apps/web/tests/multipack-app.spec.js`, `e2e/visual.spec.js` (exact copy). DEV acceptance (S02-U008 prompt on stage, c4 stop, one Continue, narration observed) is recorded after deploy.
