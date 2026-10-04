# FIA authentic-content revision

3 October 2026. The abbreviated invented narration has been replaced by the source's complete default Mark 1:1–13 sequence. The presentation stays understated and content-only.

## Source coverage

Source: `klappy/fia-functional-poc` at `df479a8a0a2003fcddab1303bf8f8c22b3f9ce88`. Its pinned original guide is `BibleAquifer/FIATranslationGuide` at `5d6d59a22caa8f8539c5ff6a3e1ec74c4cfa5c6d`. Exact source metadata and rights are retained in `public/content/source/guide.json`, `scripture.json`, `resources.json` and `manifest.json`.

| Source content | Treatment |
|---|---|
| Six stages; 130 original units | Every unit has a coverage record |
| 111 narrated guide units | Original text plus the source's reviewed spoken adaptations |
| Eight reading moments | Three translations in Hear and Heart; simplest translation in each later stage |
| Nine additional required resources | Separate retained views after the first resource at the same cue |
| 13 optional drama-example units | Full original text on request; no invented recording |
| Four pause-only units | Already spoken in preceding reviewed clips; retain explicit waiting behavior |
| Two production media-request notes | Retained in source, excluded from spoken participant flow |
| 35 approved resources | Scripture, images, maps, word definitions and optional videos |
| 143 source recordings | Original MP3 bytes; source hashes checked |

`public/content/source/audio-manifest.json` retains recording provenance. The original manifests mark these recordings **AI-generated**. They are existing FIA app recordings, not human narration. No new text-to-speech files were made for this revision. Runtime audio errors do not fall back silently to a different voice.

The source videos are compressed for this proof. The eight images/maps are copied unchanged and verified against their source manifest. The guide and resource rights are preserved; Scripture editions retain their individual source rights. The offline pack is approximately 93 MB, dominated by full narration and original maps.

## Content hierarchy in use

A guide unit introduces or asks; Scripture fulfills its reading instruction; an image/map/definition fulfills the explicit resource cue. Required assets enter the stage automatically. Multiple required assets are shown sequentially and wait individually, preserving one focal item. Optional resources open a detour with a return point. Videos remain optional where there is no authored instruction to watch them. One pinned resource may remain as a small supporting view.

## Cookbook controls

Reference app: `klappy/fia-app` at `f8776d92b090b5af5b17b17dc1137f25fb059ed0`. Its vendored glass kit is the implementation reference named by the cookbook frontend PRD (kit reference `6aa9bc3`). Seven token files are copied byte-for-byte and their hashes are tested. `GuidePrimary.svelte` ports the existing 72 px dark primary disc and 120 px DotRing geometry. Secondary navigation uses the quiet treatment; microphone and options use the glass utility treatment. Icons use the same Lucide vocabulary. UI typography uses the system/SF fallback stack; Scripture uses the bundled Noto Serif Latin font and OFL license. No Apple font binaries are redistributed.

This is a Svelte compatibility port, not a claim to have imported the React components verbatim. The composition intentionally omits v2 framing per the user's instruction. Back and Skip flank the permanent primary action; microphone/options remain separate. No fading navigation or swipe requirement remains.

## Boundaries

Source review and automated behavior checks substantiate content and transitions. They do not establish physical-device usability, audible recording quality, native readiness or a fresh live v2 audit. The browser policy check blocked rendered inspection. Exact audio offsets across detours, captioning, and a live conversational/MCP integration remain future work. The larger proposed schemas are not fully enforced runtime contracts yet.

## Aligned Scripture follow (3 October)

All three translation recordings now carry the source repository's existing word-level alignment: 39 verses and 907 timed words. The importer checks each alignment's recording SHA-256, source SHA-256, individual verse source ID/HTML hash, exact display text, ordered timestamps and character offsets. Original alignment files are preserved under `public/content/source/alignment-*.json`; their data is bundled with the content pack for offline use. No timestamps were estimated from paragraph length.

The reading view follows the active recording's media clock, including changes in playback speed and movement within long verses. It scrolls only when the current line leaves a comfortable reading band. Pausing freezes following; unrelated audio cannot drive the passage. Manual wheel, touch, scrollbar or keyboard interaction suspends following until the person selects **Follow reading**. Open sheets/content tools suspend automatic movement. Reduced-motion preference uses instant positioning. Focus is never moved, and words are not announced through a live region.

Precise word alignment remains Scripture-only. Guide paragraphs and definitions now share the same reading viewport and use a duration-based overflow scroll while their own recording plays. This fallback is approximate, not fabricated word timing; manual scrolling suspends it. Browser rendering and listening review remain unverified under the existing tool-policy limitation.

## Shared reading layout and quiet controls

Guide, Scripture and definitions use the same text size, Noto Serif face, line spacing, column width and safe-area-aware viewport. Guide text is no longer an oversized centered heading. Slight overflow participates in the duration fallback, reaching the last line before the recording ends. Only overflowing content scrolls. Visible Back/Skip/primary labels were removed at the user's request; accessible action names, large touch targets and the changing Play/Pause/Continue icon remain.

## Centering and Scripture attribution correction

Text groups now center vertically in a symmetrically protected reading area when they fit. Auto margins collapse for overflowing content, preserving access to the first line and playback-follow behavior. The Scripture reference and translation name are visible again as a quiet heading immediately before the passage, within the same centered/scrolling group. Transport remains icon-only.

## Follow position correction

Playback following now targets the vertical center of the reading viewport for each spoken line rather than waiting for a bottom threshold. Overflowing text receives half-viewport leading/trailing space so even its opening and final lines can reach the center. Short text keeps its existing static centering. Repeated words on the same line do not restart the same scroll animation. Manual exploration still suspends following; the guide duration fallback remains approximate.

## Visual-description ordering and direct control

For images and maps, playback now runs the FIA instruction first, then the existing generated description only when descriptions are enabled. With the preference off, automatic playback reads only the FIA instruction. The required visual stays on screen and discussion still waits. A speaker toggle on every described image/map shares the same persisted preference with Settings and conversational preference commands. Its tooltip explains the current state and order. Enabling during FIA narration queues the description after it without interruption; enabling at the discussion pause starts the current visual's description. Disabling during a description stops that description without advancing the guide. Explicit one-off description requests remain available.

Overflowing text now opens as though its first three lines form a centered block. Leading scroll space subtracts one and a half measured line heights and any Scripture heading height; it scales with larger text. Trailing space still allows the final spoken line to reach the center. Short blocks retain normal vertical centering.

## Image and map exploration

Images/maps now support 1×–6× zoom and bounded panning only in a full-screen modal overlay. Tap the visual to open full screen; pinch, pointer drag, wheel zoom and keyboard arrows/+/-/0 handle exploration without a visible zoom toolbar. Pan bounds use the fitted image dimensions, including letterboxing. The current stage remains mounted and fitted while the overlay is open. Closing returns to that fitted view. The overlay has a close control/Escape handling as its only overlay control. Opening/closing never calls the audio stop/pause coordinator; FIA narration can complete and continue into an enabled description while the overlay stays open.

## Continuous visual surface

Image/map stages and the full-screen visual overlay now use the same paper surface and ink-colored controls as the reading flow. Removed the separate dark media-stage theme, including its white navigation and alternate dot-ring colors, so entering media no longer switches the surrounding interface to black. Source media pixels are unchanged.

Pointer contact, wheel input and zoom/pan keyboard commands open the expanded view before any transformation. A small expand icon marks this affordance; the inline image never zooms or pans. The previously requested inline description preference remains available. Playing and paused audio both retain their state across opening and closing.


## Character rosters as one reading surface

The original HTML represents “The characters in this passage are:” as a paragraph followed by seven list items. It is not a single/double-newline distinction. Previously the importer presented each unit as a separate page. The two rosters (S03-U009–U016 and S04-U004–U011) now carry an explicit readingGroupId. Their heading and names appear together while the existing eight recordings play in order. No source text, recording, activity ID, saved index or source coverage was removed.

The presentation uses one stable, semantic list with the same reading typography and overflow behavior. Following centers the current item when needed; manual scrolling remains respected across recording changes. Back and explicit Continue/Skip operate on the whole reading group; automatic narration still advances through individual source units. Silent continuation also crosses the whole list. Other list items, particularly discussion questions, remain separate activities.

Authoring rule: line breaks and list markup describe text layout; an explicit reading group describes a shared screen. A discussion or required media interaction remains its own activity. Do not globally collapse every list or every single-line break.


## Reviewed list contracts replace character-specific inference

All four list runs in the pinned source guide are now classified in content/list-plan.json. The two rosters use descriptive-list; S05-U009–U012 uses explanation; the six questions introduced by S01-U002 use discussion. Grouping no longer tests for the phrase “The characters in this passage are:”.

scripts/list_contract.py applies purpose-based rules and compiles listContracts into the content pack. Together-layout groups preserve individual recording IDs and audio order; separate discussion items retain explicit confirmation. The question introduction retains its original three Scripture readings. The prophet explanation retains the following term resource and discussion pause.

Source ID/hash bindings and exhaustive coverage reject unreviewed or changed lists at import time. A together-layout block cannot contain a pause, resource cue or inserted activity. Authored action and media rules are defined for future lists, but no such list occurs in this guide. Changes require a reviewed classification, not automatic wording or newline guesses.


## Progress, section transitions and optional dark palette

Two text-free rows show actual session progress: six completion segments above a current-section content path. Source narration is a dot; Scripture, discussion, image, map, term and video content use existing Lucide iconography. Grouped lists count as one screen, giving 111 visible screens across 128 source activity positions. A screen is complete only when all its source beats are completed; optional detours never change the held guide progress. Explicit skipping follows the existing engine's completion semantics. Long sections show seven positions around the current screen with continuation marks.

Either progress row opens an icon-only section overview. Choosing a section preserves completion history and presents its title transition. On crossing sections, the existing primary button enters the first instruction without skipping it; narration waits for that action. There is no newly generated transition audio. The active transition is persisted on reload.

Preferences now includes Dark theme, stored on the device. The palette follows the approved mockup's charcoal/olive surface and pale neutral ink. The light palette remains the default. Changes override only color/material tokens; cookbook files, icons, control geometry and typography are unchanged. The new progress area reserves reading/media clearance.

The image/map expand hint is now a 52-pixel glass circle with a 22-pixel icon, matching the description toggle. It is fixed at the same bottom offset on the mirror (left) side and remains part of the image's expand interaction.


## Top-edge progress, direct content map and continuous text following

Progress now sits against the safe top edge. Microphone and menu keep their existing shapes and sizes, on opposite sides beneath the two progress rows. The current section's icon anchors the content path. Five nearby screen markers plus continuation marks fit narrow phone widths; the full map remains available on tap.

The thin section bar and its moving bead now represent the same navigation position. The bead sits at the fill endpoint, not beneath the middle of the section. This is position through the guide, not a claim that earlier skipped-to content was completed; completion history is still tracked separately. Both move backward when navigating backward.

The overview now renders all 111 visible content screens, each with its own accessible 44-pixel target. Image/map targets use original thumbnails; other targets use content icons. Selecting an item opens that exact activity with narration ready, without the section title interstitial or false completion. The larger section icon opens that section's title transition.

Text following uses one requestAnimationFrame controller with an evolving target instead of repeatedly restarting native smooth scrolling on audio ticks. It applies gradual frame movement, preserves the current-line centering and approximate guide-duration logic, stops for manual exploration/pause/open sheets, and cancels on teardown. Reduced-motion preference uses immediate positioning.


## Key-term instructions and glossary readings are separate phases

Fixed a presentation/transport mismatch affecting all 11 narrated key-term activities in Filling the Gaps. Previously the definition occupied the screen during the FIA discussion instruction, and the glossary audio started immediately after “Pause this audio here.”

The authored instruction now remains visible during narration and the following discussion wait. Continue explicitly reveals and reads the definition; completion of that recording still waits for Continue before advancing. Typed/conversational Continue uses the same boundary. Explicit Skip remains a skip. Optional glossary detours and additional resource-only activities still open their definitions directly.

The definition phase is persisted with its activity ID, cleared on navigation/reset, and ignored in a detour. Replay returns to the instruction. Existing source recordings and activity indices remain unchanged.


## Glass frame and reclaimed reading area

The viewport edges now carry continuous translucent cookbook glass surfaces behind the existing controls, using glass-fill-2, blur-medium and sat-glass with both standard and WebKit backdrop-filter. There is no divider, gradient fade or added rounded container. Opaque progress/bead backgrounds are removed. Dark mode inherits the smoked glass palette.

The reading scroller now spans the viewport and can pass behind the fixed glass surfaces. Initial/terminal content padding reserves the actual frame extents, and automatic line following uses their measured clear rectangle. Top reservation is 154px plus safe-area inset; bottom is the existing 120px control extent plus its actual bottom offset. Compared with the former equal 176px gutters, the no-inset clear reading area grows by 62px. Image/video fit areas also use these reservations; full-screen exploration remains edge-to-edge.

Glass is pointer-transparent. Existing buttons retain their geometry and hit areas. Browsers without backdrop-filter and users requesting reduced transparency receive a solid readable surface. No source content or recordings changed.

## Consistent resource attribution

Scripture, key terms, images, maps and videos now share ResourceIdentification: a quiet title plus original source/translation credit. The long FIA organization name is displayed using its existing FIA abbreviation; license text is retained. Key-term prompts and definitions both identify the resource. Visual/video headers occupy their own flow space below the glass controls, and expanded images/maps retain the same credit beside the close control. No extra tools need to be opened to identify a resource.

Image/map attribution now reserves its measured height symmetrically above and below the fitted visual, keeping the visual centered in its original clear viewport. Expanded views use the same rule. A ResizeObserver updates the reservation when the credit wraps or text sizing changes; video layout is unchanged.

The top glass now covers only the two 44px progress rows (88px plus safe inset). Mic and menu remain 52px independent glass circles, six pixels below that panel, with the same 20px side insets as media controls. This returns another 66px to the clear reading viewport. Visual attribution sits between the floating controls so its title/credit do not land underneath them. Image/map centering continues to balance the actual wrapped attribution height.

The mini map now uses the cookbook frosted glass surface in both themes, with a solid fallback for reduced transparency or unavailable backdrop filtering. Each step has a visible heading paired with its section icon; whitespace divides the six content groups. The heading still opens the section transition, and all individual content icons/thumbnails retain direct navigation.

Top progress spacing now uses a single 66px accessible hit area: 12px above, between and below the thin section track and 28px content row. The current section icon and current content marker are circled; dangling selection dots and the section-track dot are removed. Ordinary narration dots retain their content meaning. The top glass and floating utility positions follow the shorter height.

Progress spacing refinement: 20px above the section track, 12px between/below, for a 74px frame. The persistent left section icon has no selection circle; only the current content item is circled.

The mini-map current-item highlight no longer has a dangling dot beneath it.


## Reversible cookbook material trial

Baseline source: `e801aaa887166ece75383933f0e750286edf5695` (published before this trial).
`src/cookbook-materials.css` ports the actual material declarations of the reference kit's GlassIconButton, GlassSurface and GlassSheet. Buttons now use 160% saturation with WebKit support; edge panels gain the surface recipe's specular edges/refraction; all sheets use the cookbook floating material and heavy blur. Floating material is solid-backed by design, so the mini map is more opaque than the previous custom treatment. Geometry and reading flow are unchanged. Existing dark palette retained with restrained dark specular tokens; reduced-transparency fallback covers every adapted surface.

Rollback: remove only `import './cookbook-materials.css';` from `src/main.js` and republish. The previous CSS and vendored tokens are unmodified. This restores all pre-trial materials without reverting subsequent content or flow changes.

Progress icon vocabulary is now shared by the strip, mini map and section transitions. Hear and Heart uses Heart; guide narration uses Speech (a speaking person), including the detailed outline. All content markers are icons; narration no longer uses dots. The speaking-person symbol is a candidate for oral-culture usability testing, not a claim of universal recognition.

All buttons now share the same subtle hover lift/opacity and press scale, with existing keyboard focus and reduced-motion support. Custom glass hover glows and menu hover fills removed. Bottom frame reduced from 136px to 108px before safe-area insets; 72px primary disc and 120px decorative ring retained. Dark primary disc uses pale ink with dark paper-colored icon.

Control spacing correction: removed the description-toggle-specific color/inset ring; Volume2/VolumeX and aria-pressed retain state. All four floating controls use a shared 20px side/nearest-bar inset, respecting safe areas. Footer is 72px controls plus equal 20px padding (112px plus bottom safe area); full-width footer clips decorative ring overflow and passes pointer input through outside buttons.

Current progress markers now use the GlassIconButton material instead of an ink outline: strip current item, mini-map current item and current section choice. Sizes and navigation semantics remain unchanged; shared hover/press behavior remains on actual buttons. Reduced-transparency fallbacks included.

Aurora trial: scene and expanded visual now use the unmodified cookbook aurora-field token, with a charcoal veil in dark mode and solid reduced-transparency fallback. Floating sheets retain the cookbook solid-backed material-floating recipe, providing a lighter readable layer above the colored scene. Resource title/credit sits in the same 52px row as the floating controls, 20px below the bar and 20px clear of each button; measured credit-height balancing still centers media. Removing cookbook-materials.css import also reverses the aurora trial.

Mini-map image/map thumbnails use a centered 36px square cover crop. Full resource views retain their complete images and maps.

Dark aurora visibility correction: removed the 92% charcoal veil. The same cookbook field geometry and RGB hues now render directly over charcoal at 18–28% opacity. This is an explicit dark adaptation, not an original cookbook dark token.

User-directed palette correction: replace olive/charcoal overrides with cookbook night-800/night-900 backgrounds, night-700 floating surfaces, night glass fills/borders, neutral ink and sky focus/dot accents. Aurora retains cookbook hues and field geometry over those night surfaces.

Thumbnail refinement: mini-map resources now use 24px circular crops alongside 20px line icons, retaining the 44px minimum navigation targets. This supersedes the square thumbnail treatment.

Top progress panel now matches footer padding: 20px above and below, retaining the 12px inter-row gap. Frame height is 82px plus safe-area inset; dependent controls/content clearance follow the shared chrome-top value.

Expanded images/maps now use the full viewport: visible attribution header and balancing footer space removed in the modal, retaining accessible source text and a floating close button. Normal resource headers remain visible. Audio ownership is unchanged.

Modal material revision requested by user: replace the original solid-backed GlassSheet material with cookbook GlassSurface fill-3 in light mode and glass-fill-night in dark mode, heavy blur and shared edge highlights. Header no longer adds an opaque layer. Backdrop tint is neutral at 12%. Solid accessibility/unsupported-browser fallback remains. Top padding now 30px; bottom 20px, frame 92px plus safe inset.

Utility simplification: removed microphone control and browser speech-recognition setup/permission flow. Menu occupies upper left; image/map description toggle occupies upper right, sharing 20px insets. Removed expand hint; tap, pinch initiation and wheel still open the full-screen viewer. Existing narration and typed command tools retained.

Menu cleanup: four primary entries (Passage resources, Preferences, Replay, About & sources); conditional release of previously pinned content retained. Removed redundant back/next, alternate session outline, transcript/tools, conversation and test navigation. Drama example moved into resources. Offline saving remains in Preferences; mini-map remains accessible through progress.

Aurora primary trial: deep indigo/pale icon in light mode, cookbook lavender/deep indigo icon in dark mode. Existing dots breathe in opacity over four seconds only during playback; disc stays still and reduced motion disables animation. No playback arc added yet.

Primary refinement: decorative dot field removed in favor of cookbook 96px/3px playback ring around the 72px disc. Arc uses actual audio elapsed/duration, remains fixed when paused and clears when audio is released. Static aurora gradient replaces solid disc fill; no decorative animation. Video progress is not represented by this audio-only arc.

FIA brand refinement: use PoC brand blue #3b6086 (v2 alpha.css provenance) with lighter/darker depth stops on the primary. Menu uses the exact SYMBOL paths copied from v2 FiaLogo.tsx, whose provenance is PoC FiaBrand.jsx at 62a979f. No logo geometry redrawn. Playback geometry and behavior retained.
