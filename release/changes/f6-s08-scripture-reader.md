# F6-S08 — Scripture reader in glass (the guide card's Text view)

Train: Alpha v2 lane F (F6). Branch `claude/blissful-bohr-t7m7it-l1-s08` (base `v2/integration`).

## What changes

- `src/screens/S08ScriptureReader.tsx` — S08 composed of S05's shared parts (nodded mock cookbook
  `design/alpha-v2-screens/08-scripture-reader.html`; PRD § 4 S08): `ScreenFrame` (glass header),
  `ProgressBand` at the guide's own position, the guide card with `CardViews` (Text active), the
  voice chip (`ProvenanceChip` → sheet 20), the edition on kit `GlassSelect`, "Play this verse again"
  (quiet kit `GlassButton`), the passage in the card body, and the thumb zone (`GuideTransport` +
  `GuidePrimary`, arc = elapsed reading). v1 bones kept: catalog editions, word/verse band from the
  C-12 sidecar, tap a word or verse to seek, switch edition keeps the verse, untimed notice once per
  session, no disabled primary when there is no clip, a cold open with no guide still reads.
- `src/components/glass.ts` — `GlassSelect` wrapper (kit `forms/GlassSelect`).
- `src/components/AudioControls.tsx` — `GuideTransport` Back / Skip optional (the reading's primary
  stands alone).
- `src/flow/ui/guide.css` — S05's frame rules shared with S08 (`:is([data-screen='S05'],
[data-screen='S08'])`, no copy); a small shared Text-view block (`.fia-reader-*`: tools row,
  reading face, verse/word bands per mock 08).
- e2e: `e2e/f6-s08.spec.ts`.
