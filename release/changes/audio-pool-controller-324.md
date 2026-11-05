# Persistent audio pool + script controller (draft, PR #324)

- One persistent player per distinct audio file (reuse = instant seek); the controller owns script, sidecar word map and auto-advance.
- Mark 1:1–13 shows a word highlight caption from `<audioSha256>.words.json` sidecars (public/transcripts).
- Release closure pins regenerated for the changed sources and rebuilt dist; needs independent closure review before merge.
