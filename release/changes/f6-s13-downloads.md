# F6-S13 — Downloads / offline in glass

- S13 is a Layer frame (PRD § 8.1): logo and one labelled way back in the glass header ("Back to {ref}" when opened from a passage, else "Back"); no language pill, no Explore (registry `dock: false`). The v1 `⟵ Back to {ref}` row moved into the header.
- Group overlines (shared `.fia-overline`); pack cards on kit GlassSurface with the kit SyncBadge for "Saved ✓"; Pause / Resume / Update / Remove / Keep / Re-save / Try again as the shared `QuietAction` (kit GlassButton quiet + kit Icon); the catalog row "Catalog + text (all languages) ✓" (v1 spec, was missing) on a level-1 GlassSurface.
- v1 strings and behaviour unchanged (Saved only after verify, Remove only after the confirm, partial n of m + Resume, offline disables the primary). No new i18n keys.
- Shared layer: carries commit `c525b15` (ScreenFrame `close`, LayerHead, app.css layer block) from #65/#68/#69 unchanged, and commit `24a556e` (shared `QuietAction`, `KitPrimary disabled`) also carried by the sheet 22 and 23 PRs. `src/offline/offline.css` restyled on kit tokens (shared by S13, S17 and sheets 22/23). No per-screen CSS.
