# S01 in Spanish: the picker's own words, and use mode reads content-only

Branch `claude/blissful-bohr-v9w7u0-fuab` (base `v2/integration`, stacked on #98). Cookbook unit
`work/active/2026-10-03-fia-spanish-ui-strings`, follow-ups FU-a and FU-b (TICKET.md:24-25).

## What changes

- **FU-a — `src/components/LanguagePicker.tsx`**: the vendored kit `LanguagePicker` draws its chrome in
  English and has no prop for it. The app wrapper now relabels those text nodes from the app catalog:
  group heads (Suggested, All languages, Matches for “…”), the "n of m" count, Clear, the empty-search
  line (`s.lang.empty-search`, per the design table), the row notes (Full coverage, “n available · n
  AI-translatable”, No resources yet), the legend and the chip tooltips. It writes node data only, so
  React keeps its handles, and re-applies on every kit re-render. The vendored kit is not touched.
- **`src/i18n/{en,spa}.json`**: 15 new `s.lang.kit.*` keys. The English values equal the kit's words,
  so the English UI does not change. The Spanish values are an AI translation, like the rest of
  `spa.json`, until a human translation lands.
- **FU-b — `src/screens/S01FirstRunLanguage.tsx`**: in use mode (`/?mode=use`, the header pill) the
  first-run lede ("one pick sets the guide and the app") is gone; only the catalog count stays. A pick
  other than the menus' language reads `s.lang.primary-use-content` with `s.lang.content-only-note` on
  the line above the primary. A pick in the menus' language reads `s.lang.primary-use`
  (design/alpha-screens/01-first-run-language.md:64).

## Open

- The new `s.lang.kit.*` keys are not yet in the cookbook string table (design/alpha-screens/
  01-first-run-language.md), so `npm run strings` would drop them from `en.json`.
- The kit's "AI" badge on chips and in the legend stays "AI" (it is a mark).
