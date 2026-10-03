# F6 sheet 22 — Update notice in glass

- On the shared Sheet (kit GlassSheet, FIA lockup before the title): the pack line `{ref} · {language}` as the sheet's description under the title; revision and download line on one level-1 kit GlassSurface well; `Keep the current version` / `Later` as the shared `QuietAction`.
- One dark `KitPrimary` with a glyph: `Update ({delta} MB)` with the download glyph; offline it reads `— needs connection` and is disabled (22 States); app variant `Reload now` with the update glyph.
- v1 strings and behaviour unchanged (R-310 old files removed only after verify; R-704 never applied without the tap; Keep remembered per revision). No new i18n keys.
- Shared layer: carries commit `0d8885b` (`QuietAction`, `KitPrimary disabled`, `actions.css`), the same commit on the S13 and sheet 23 PRs; the `offline.css` closing block is byte-identical on all three. No per-screen CSS.
