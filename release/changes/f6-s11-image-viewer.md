# F6-S11 — Image / map viewer in glass

- S11 Layer frame (PRD § 8.1): the image first in the shared dark media well (`#0F131A` in both themes; pinch-zoom and double-tap from the first frame, R-507), then the ▲ kind line ("Image" / "Map") and the title (shared `LayerHead`).
- Marks as `ProvenanceChip`s (kit GlassChip → sheet 20): "About this image" for a source title, "Map in English · not yet in {language}" for an English map, the description's mark; Describe as a kit GlassButton, disabled while the description is not yet made (R-509).
- The one primary is the way back ("Close · back to unit n" / "Close · back to Resources"). No per-screen CSS; the shared layer commit is the same one the S10 and S12 PRs carry.
