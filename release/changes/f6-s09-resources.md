# F6-S09 — Resources in glass (the guide card's Resources view)

Train: Alpha v2 lane F (F6). Branch `claude/blissful-bohr-t7m7it-l1-s09` (base `v2/integration`).

## What changes

- `src/screens/S09ResourcesCatalog.tsx` — S09 composed of S05's shared parts (nodded mock cookbook
  `design/alpha-v2-screens/09-resources.html` / 09b; PRD § 4 S09): `ScreenFrame`, `ProgressBand` at the
  guide's position, the guide card with `CardViews` (Resources active), and inside it the v1 catalog
  on the kit parts the PRD names: `GlassSearch`, `FilterChips` (one type at a time, counts inside,
  zero-count types hidden), `CatalogRow` rows (type · mark overline, title, caption) with a quiet (i)
  → sheet 20. No primary (rule 1). v1 strings, open paths, offline captions and provenance kept.
- `src/flow/ui/guide.css` — S05's frame rules shared with S09 (no copy); a layout-only `.fia-res*`
  block (column, row with (i), chips wrap).
- e2e: `e2e/f6-s09.spec.ts`.
