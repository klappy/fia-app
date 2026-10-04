# FIA v3 — one activity system, two ways to participate

> Historical design reference, preserved for the approved experience. Runtime restoration follows cookbook recipe PR #109 (accepted commit 35fcbe52170dacea23ffe9f0aa070a1c92fed508), using approved prototype source 0af90274f13b32a776466e436cd114e6de759783.

Status: working design and functional proof of concept, 3 October 2026. This document records the decisions developed with the user in this task. It is not a claim that v3 is production ready.

## Product direction

The historical prototype established the Svelte experience. Current delivery restores that approved experience; v2 work is halted. Preserve FIA's focused primary action and calm presentation while correcting the underlying activity sequence. The few visible controls borrow the cookbook glass kit: unchanged tokens, a Svelte port of GuidePrimary and DotRing, quiet secondary navigation, and glass utility controls. Content remains unframed. Svelte reduces component ceremony; good boundaries, contracts and tests—not a framework alone—prevent accumulated complexity.

The intended v3 experience is conversational and voice first. The screen is a quiet stage that presents approved Scripture, iconography, images, maps and video as the conversation needs them. Touch remains available. The dependable fallback is the **same narrated, scripted experience without voice input**, operated with a few taps. It is not a separate, less capable guide that merely exposes links to resources.

Build the scripted activity engine first, prove a complete passage, then give a conversational agent control over its permitted actions. Voice and touch share position, media state, preferences, detours and progress.

## Content-only presentation correction

The first proof had too much traditional application framing. The user's correction is decisive: **no framing, just the content**. The current presentation removes the header, brand badge, container cards, activity labels, progress bar, mode tabs, persistent captions, and chat sidebar. A passage, image, map, video, or spoken prompt occupies the stage itself.

Back and Skip flank a large, permanently visible Play/Pause/Resume/Continue control. Microphone and More options sit separately at the top. No swipe gesture is required. Conversation input, history, narration text, sources, preferences, session navigation and media tools are requested overlays. They do not occupy the default stage. Scripted and conversational actions still use the same engine. Explicitly kept content can remain as a small supporting visual.

## The problem to solve

The user reports that today's guide can instruct a group to read Scripture or discuss an image without actually entering that activity or presenting the content. Continuing guide narration alone is not successful progression. A chip linking to a required resource does not fulfill the instruction.

An activity cannot become ready until its required content is presented, or its absence is explained with an explicit recovery path. Presenting a video and starting audible playback are separate actions. Discussion waits for the group's continuation; narration ending must not imply that discussion is finished.

These are user-reported issues and accepted design requirements. The prior source-based audit did not establish physical-device behavior or constitute a fresh live usability study.

## Inventory before components

The traceable mapping is:

**content → relationship → role in this activity → presentation → permitted actions → component**

Content is not permanently primary or secondary. An image is primary during image discussion, essential support during an introduction, and optional exploration elsewhere.

| Content type | Typical relationship | Role at its authored moment | Presentation | Completion |
|---|---|---|---|---|
| Guide instruction | introduces / follows | Primary activity | Spoken instruction and restrained text | Narration completes, or explicit continuation where authored |
| Scripture | reads / explains / requires | Primary activity | Exact passage visible; reading mode applies | Reading playback ends, or person confirms reading |
| Discussion prompt | asks about / requiresDiscussion | Primary activity | Prompt with referenced content retained | Explicit group continuation |
| Image | illustrates / depicts | Primary or essential support | Inline image with meaningful caption | Discussion completes; viewing alone does not complete it |
| Map | locates / contextualizes | Primary or essential support | Inline map; enlarge and inspect available | Explicit continuation |
| Video | demonstrates / explains | Primary viewing activity | Poster and player ready together | Playback ends or explicit skip |
| Key term | explains / requiresDiscussion | Primary at an authored word discussion; optional elsewhere | Original definition and source recording | Group continuation, or return from exploration |
| Narration / source recording | narrates | Audio layer tied to content | One audio owner with visible playback state | Appropriate playback completion event |
| Attribution / translation | sourcedFrom / translates | Metadata | Quiet source label and details | No progress change |
| Availability | requiresDownload | Status | Truthful availability, retry or available alternative | Successful recovery or explicit skip |

Navigation, playback, progression and status have different visual treatments. Primary action advances the current activity; supporting actions deepen it. Chips may express filters or metadata, but are not the route into required content.

## Authored activity contract

Every activity identifies:

- Required and optional content, with stable IDs and provenance.
- The relationship that makes each item relevant.
- Entry cues: show required content before delivering a dependent instruction.
- Narration or media policy, distinct from presentation policy.
- A completion condition and explicit skip policy.
- The exact next activity and any detour return point.
- Interrupt, failure and restoration behavior.

A representative reading round trip is: introduce Scripture → show exact passage → read or play according to preference → complete reading → return to the authored continuation. No LLM is necessary to discover that the reading belongs here.

An image discussion is: show referenced image → deliver discussion prompt → retain image while the group talks → wait → continue. Maps follow the same pattern. Videos appear at their authored cue; the player does not compete with guide narration.

## Shared behavior and state

The engine owns activity position, phase, completion, return stack, presentation, pin state, preferences and audio ownership. UI components render that state and dispatch validated actions. They do not independently infer progression.

A practical boundary is content contracts + activity engine + presentation policy + audio coordinator + storage/platform adapters + Svelte views. Native adapters can later supply durable downloads and native audio. A future MCP adapter exposes the same permitted capabilities rather than duplicating guide logic. The proof includes a feature-detected in-page WebMCP-style registry for reading session state, showing approved resources, returning to the guide, and explicitly completing the current activity; no supported live host was available to validate interoperability.

Detours preserve a checkpoint before exploration: activity, phase, content, playback position where supported, and presentation. Returning restores the checkpoint and does not silently skip or restart the guide. Preference changes made intentionally during a detour can persist independently of its checkpoint.

## Presentation policy and Jev

Jev-style, versioned judgments may propose what to present and what to do next. They must return structured decisions against approved IDs and actions. The application validates those decisions, applies hard rules, and records the outcome. This prototype does not implement live Jev or LLM inference.

Presentation decisions cover show, retain, demote, replace, hide and restore. Inputs include conversational intent, activity requirements, relevance, availability, active interaction, playback, pin state, recent stage history and display capacity. Outputs include the approved component, content, contextual role, reason, confidence and fallback.

Hard rules:

1. Required activity content must be present before dependent narration or readiness.
2. Never dismiss content during active touch interaction.
3. Do not hide playing media because the conversation mentions something else.
4. Retain pinned content until the person releases it; if capacity conflicts, ask or defer the new item.
5. Preserve a recoverable recent-content history.
6. Uncertain judgment retains a stable stage or asks for clarification; it does not force novelty.
7. No arbitrary remote assets, HTML or executable components from model output.
8. Reduced motion, text scaling and accessibility remain application responsibilities.

**Hypothesis to test:** one focal item and at most one supporting item provides sufficient clarity on a phone. It is a proposed visual budget, not a universal rule. Pinning, large text and small displays must be evaluated rather than hidden behind this assumption. A pinned item may remain accessible outside the focal position; pinning does not require preserving a full-size layout forever.

## Next-action policy and preferences

The same next-action rules govern voice, typed intent and taps. A decision considers the authored step, explicit request, applicable preferences, available content, current interaction and audio owner.

| Scope | Example | Meaning |
|---|---|---|
| Once | “Describe this image.” | Execute now without changing future defaults |
| Next | “Read the passage next.” | Queue one permitted action; consume after execution |
| Session | “For this session, read the passages.” | Apply matching behavior until session ends |
| Persistent | “Always read passages aloud.” | Save an acknowledged default with an easy reset |

An explicit immediate request takes precedence over a matching default, within valid transitions. Preferences choose **how** an activity is experienced; they do not silently complete it, omit discussion, or invent content. Ambiguous scope or referents call for clarification. “Always” must be acknowledged in plain language. Unavailable audio explains the limitation and offers visible text or a deliberate skip.

## Audio and conversational identity

Exactly one audible source owns playback: guide narration, Scripture/source recording, video, or conversational speech. A new source pauses or stops the previous source according to the transition contract. Interruption and return are explicit events.

Using one voice for AI and narration versus distinct “people” remains a design choice. Preserve source recordings and distinguish a recorded reading from generated explanation. The proof now copies 143 existing source-app MP3 recordings unchanged, with byte hashes and source-text bindings. Those recordings are marked AI-generated in the source manifests; they are not human narration. Reviewed source adaptations retain their exact expected spoken text. A failed recording produces an error rather than silently synthesizing another voice. The source video retains its own recorded audio.

A discussion stop is quiet and does not auto-advance. People must be able to interrupt, replay and resume without losing their place. Voice input availability must not determine whether the scripted experience works.

## MCP and generative UI

The v3 architecture treats MCP-facing capabilities as a planned boundary: retrieve a passage, inspect an activity, show approved content, request a permitted action, play or interrupt media, read/write scoped preferences, and restore a checkpoint. BT Servant and other hosts could consume those capabilities later.

Sharing capabilities and embedding interactive UI are separate proofs. Host support, session ownership, permission scope, rendering formats and synchronization need research. There is no deployed external MCP server or proven third-party host integration in this prototype. The JSON schemas in `contracts/` are proposed versioned boundary contracts; they are not a claim that every field is already wired into the local engine or an official Jev schema.

Generative UI means selection and composition from an approved vocabulary. The LLM does not design a new interface from arbitrary markup on every turn.

## Worked decisions

**Map requested during discussion:** an explicit “show the map” request opens an approved map detour, preserves the image-discussion checkpoint, and pauses competing narration. Returning restores the discussion rather than marking it complete.

**Persistent reading preference:** “Always read passages aloud” stores an acknowledged default. On reaching Scripture, the engine shows the passage and requests its available reading. The next discussion stop remains intact.

**Image still being examined:** a topic change suggests a map, but the person is zooming the image. Presentation waits until interaction ends. If the image is pinned and the stage is full, ask or defer instead of dismissing it.

**Unresolved reference:** “Show that” matches two recent assets. The decision requests clarification and keeps the stage stable.

## Contract evaluation cases

| Case | Required result |
|---|---|
| Guide says “discuss this image” | Image is already shown; prompt and wait are active |
| Guide reaches Scripture | Exact passage appears; reading policy applies; continuation returns correctly |
| Video enters | Video is visible; no overlapping guide audio |
| Narration ends during discussion | Discussion remains; no automatic completion |
| Person says continue while media plays | Explicit transition handles playback ownership; no orphan audio |
| Image is touched or pinned | Automatic cleanup does not dismiss it |
| Required asset fails | Error and recovery appear; activity does not falsely report readiness |
| Detour and return | Activity and appropriate media position restore |
| “Always read” followed by a discussion | Reading changes; discussion is not skipped |
| Ambiguous command or low confidence | Stable state and clarification, not an invented action |
| Touch and voice request same action | Equivalent validated transition |
| Refresh or mode switch | Progress restores; audio does not unexpectedly autoplay |

## Build sequence and proof boundaries

1. Inventory actual authored content and relationships. Distinguish verified bindings from missing or assumed bindings.
2. Implement a short complete narrated, few-tap sequence in Svelte.
3. Exercise interruptions, detours, failure and restoration.
4. Add a live conversational slice over the same action boundary: ask a question, show a relevant approved map, interact, interrupt, resume and switch modes at the same position.
5. Prove the slice in Capacitor on real iOS and Android hardware before committing to the full native release.

The native proof must cover audio interruption, lock-screen behavior, app suspension/termination, durable downloads, airplane-mode cold start, safe areas, back navigation, system text sizing, screen readers and reduced motion. A wrapper alone does not establish native quality. The current prototype is not wrapped or validated as a native app.

This proof includes the complete default six-stage Mark 1:1–13 flow: 111 narrated source units, eight inserted Scripture readings, and nine additional required-resource views, making 128 activity positions. All 130 source units are accounted for: 13 optional drama-example units are available as text on request, four pause-only units are merged into the source's reviewed preceding recordings, and two production media-request notes remain in the source archive. The merged pause moments still wait for the group. All 35 approved resources are available, including three optional companion videos. No video is forced into the guide where the script does not request it.

Optional browser speech recognition feeds the same bounded interpreter as typed commands and may use an online recognition service. Commands are not open-ended AI reasoning. Preferences cover Scripture reading, image descriptions, optional-video autoplay, speed, text size and reading without narration. The Session sheet groups navigation by the six source stages. Offline saving requests the roughly 93 MB local pack; browser storage may be evicted. Exact playback position across detours/reloads, active-touch protection, and resource-failure readiness enforcement remain follow-up work. This is a complete passage flow, not all FIA content or a native release. See the content receipt and validation document for evidence and remaining limits.

## Source context and attribution

The design decisions above primarily come from the user conversation. The following existing repositories provide reference context, not evidence of tests performed in this prototype:

- [FIA frontend v2 PRD](https://github.com/klappy/fia-app-cookbook/blob/main/product/ALPHA-V2-PRD-FRONTEND.md): prior discussion referenced the preserved v1 journeys and media placement rules.
- [FIA GuideChrome source](https://github.com/klappy/fia-app/blob/main/src/flow/ui/GuideChrome.tsx): prior discussion referenced the “In this part” chip treatment. `main` is mutable.
- [Pinned release notes cited by the earlier audit](https://github.com/klappy/fia-app/blob/bc1476c5e250b61a6d1bed2d010e07525102a6c5/CHANGELOG.md): historical release context, not a fresh assertion of current production status.

Do not carry the earlier stated release numbers forward as current release evidence without rechecking. This prototype does not modify v2, the cookbook or synced reference files.


## Shared list presentation contract

Content meaning determines layout and progression. The reviewed plan lives in content/list-plan.json; scripts/list_contract.py compiles it into pack.listContracts, exposed by contentContract for future tool consumers.

| Purpose | Layout | Progression |
| --- | --- | --- |
| descriptive-list | Introduction and items together | Original recordings, automatically in order |
| explanation | One explanation together | Original recordings, automatically in order |
| discussion | Each question separately | Explicit group confirmation |
| action | Each action separately | Explicit completion |
| media | Separate authored resource activity | Preserve existing media/reading flow |

Each block declares its introduction, ordered items, purpose, rationale and source hashes. Compiled output adds layout, progression and ordered narration bindings. The introduction retains its own authored behavior, including prerequisite Scripture. There are four actual source lists: S01-U002 discussion, S03-U009 and S04-U004 descriptive lists, S05-U009 explanation. All are reviewed. Actions and media elsewhere retain their existing activity contracts.

To import another guide or revise a list: identify each contiguous source list, review its intent and interaction boundary, record the classification and exact source hashes, then run the importer and flow checks. Do not automatically accept a classification from bullets, punctuation, single line breaks or double line breaks. Unknown and changed lists must stop the import for review. Grouped content must be contiguous, automatically narrated and free of resource or pause boundaries.

This is shared content metadata for the prototype, not an implemented external MCP transport or autonomous classifier.
