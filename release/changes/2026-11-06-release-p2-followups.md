Fail closed to untimed activity text when ASR matches fewer than 70% of tokens (the existing passage spoken-match floor), metadata is missing, or a word lies outside the activity/accepted playback range. Playback ranges and shipped sidecars are unchanged. Both highlighting and word seeking reject these maps.

Release saved audio players when no longer current, and bound derived audio URL caches to 24 entries each. Preserve the active owner, including paused playback, through refresh; evict idle players before revoking their URLs and clean up on teardown. Unavailable image/map stages now use the shared aligned reader with the narration clock and suspension state.

Transcript generation requires explicit `--language en|es`, uses the existing language helper/model defaults, rejects English-only models for Spanish, and fails before ASR on a failed, empty or incomplete ffmpeg decode. No corpus or Spanish machine content was regenerated.

Tracks production PR340 findings r4489180804, r4489180812, r4489180819, r4489180830, r4489180834, r4489180838 and r4489180843. Earlier deferrals are lineage only; this change does not broaden the separately accepted passage-switch disposition.
