# Test the actual Mark session

This proof now uses the full default six-stage source guide, original scripts, three Scripture translations, existing source-app recordings, eight images/maps, word definitions, and three optional videos. The source recordings are AI-generated. No new prototype narration is substituted. The optional drama example has source text but no recording.

## Start with the first stage

1. Select **Begin**. The guide introduces the passage and asks for three readings.
2. Confirm the three different translations appear and play in order: Berean Standard Bible, unfoldingWord Literal Text, and unfoldingWord Simplified Text.
3. Confirm the guide returns to “What do you like in this passage?” and waits after the recording. **Continue** is your group's decision.
4. Pause in a recording and Resume. Playback should continue at the same position. **Back** and **Skip** remain visible. Skip deliberately advances; Pause never does.

## Test the source's required resources

Use **More options → Session → Setting the Stage** to choose S02-U005. Its instruction should already show the Jordan River image. After its narration, Continue shows the required map. That second resource waits for Continue before S02-U006. No resource chip is needed.

In Defining the Scenes, S03-U007 shows the Nazareth/Galilee/Jordan map; S03-U019 presents river then wilderness; S03-U021 presents aerial Judea/Jerusalem then Jerusalem. In Filling the Gaps, the required word definitions should appear and their available source recordings should play after the guide prompt. Continue retains control of discussion.

At S06-U004, U006 and U008, the reviewed recording includes the original pause instruction. Each must stop for the group rather than immediately proceeding.

## Explore and return

From a waiting discussion, open **More options → Passage resources**. Choose a map, translation, term or video. The left control becomes **Back to guide**. Returning must restore the held activity and its waiting state without completing it. Video completion returns automatically to that held point. Native video controls can be requested through **Show content tools**.

Optional companion videos are not inserted into the required flow: the source cues do not request them. **Drama example** contains the complete optional text from Embodying the Text.

## Commands and preferences

More options → Conversation accepts `show the map`, `watch the video`, `pause`, `resume`, `return to guide`, `read the passage next`, `always read passages aloud`, and `always describe images`. The microphone uses browser-supported recognition for these same bounded commands. No live LLM, Jev service or external MCP host is connected.

A queued passage opens at the next narration/continuation boundary and holds the next authored activity. Returning must not complete that held activity. With automatic reading disabled, Scripture remains for the person to read; Replay still explicitly plays its source recording.

## Phone and accessibility checks still needed

Test at small phone widths and increased text size. Confirm all three bottom controls are reachable, labels are legible, maps can be enlarged through content tools, and utility buttons do not crowd the primary action. Test keyboard, screen reader, reduced motion, microphone permission, native-video behavior and audio interruption. Source videos have no supplied captions/transcripts; this remains an accessibility gap.

Refresh while paused: the activity and preferences restore without autoplay. Audio position within the recording is not preserved across reloads or detours; returning may restart that unit. Local Pause/Resume does preserve position.

In Preferences, save the approximately 93 MB session, then test an offline reload and audio/video playback. Storage is browser managed; recognition may still need a network. This has automated cache tests but no completed physical-device offline verification.

The automated browser could not verify an administrator-enforced policy. The implementation was tested with source checks, engine tests and Svelte integration tests; rendered visual review and audible listening remain unverified.

## Follow a long reading

Begin any Scripture reading on a phone-width display. Let it run through several verses: the spoken line should remain above the bottom controls without scrolling on every word. Increase reading size and try 0.85×/1.15× speed; following should still use the recording's position. Test a long verse that itself takes more than one screen.

Pause: movement stops. Resume: following resumes unless you previously scrolled manually. Scroll up while audio continues: the screen must stay where you put it and offer **Follow reading**. Select that action to return to the spoken line. Try keyboard Page Up/Down, touch scrolling and a mouse wheel. The next translation should start at its own first verse. With reduced motion enabled, the reading view should reposition without animated travel. With automatic Scripture narration off, ordinary manual reading remains available.

## Long guide paragraphs and quiet transport

Guide instructions, definitions and Scripture should now have the same reading layout. At a long guide paragraph, try large text on a short screen. Even a slightly hidden final line should scroll into view before the recording ends. Guide/definition movement is approximate duration-based following; Scripture uses exact source word timings. Manual scroll and Follow reading work for both. Bottom controls have icons only but retain their accessible names; check Play/Pause/Continue, Back and Skip with a screen reader.

## Image and map description control

At S02-U005, enable the speaker on the image before pressing Play. The FIA instruction must play first, followed by the source-generated Jordan River description, then wait. Disable the speaker and replay: only the FIA instruction should play. Enable midway through FIA narration: it must finish before the description starts. Disable during the description: only that description stops and the same discussion remains. Open Preferences → Describe images and maps to verify that both controls show the same state; changes persist on this device. Continue to the paired map to check that the same preference follows you.

## Zoom and full-screen exploration

Tap, begin dragging/pinching, scroll the wheel, or press a zoom/pan key on an inline image/map: it must open full screen without transforming inside the inline window. A small expand icon should be visible. Pinch to zoom and drag to pan; there is no zoom toolbar. Wheel zoom follows the pointer; keyboard +/−/0 and arrows provide equivalents, and Enter/Space opens a focused image. Open while FIA audio is playing: it must keep its recording position, and an enabled description should follow normally. Close with X or Escape: the guide position should remain and the inline image should be fully fitted again. Opening while paused must leave audio paused. Test both a tall map and a wide photograph on an actual phone.


## Character lists

In both the third and fourth sections, the character heading and all seven names should appear together. Play through the heading and names: the page remains mounted, each original recording plays once, and the next instruction appears after Angels. Pause/resume halfway. Back from the next instruction returns to the list's beginning; Skip crosses the whole list. Reload while paused on a character: the complete list and current character recording should remain available. At large text sizes, manually scroll; automatic following must stay suspended until Follow reading is tapped. Discussion questions elsewhere still appear individually.

In Filling the Gaps, the introduction ending “A prophet:” and its three attributes should remain on one page during narration. Afterward, the glossary discussion must still wait for the group. In Hear and Heart, each of the six questions must remain a separate page requiring Continue.


## Progress and palette

Check the two progress rows on a narrow screen. A character list moves through its recordings without adding progress beads. Opening and returning from an optional resource keeps the current bead. Tap either row: the section overview uses large icon-only targets. Choose another section, then Continue: the first authored instruction must play before its Scripture reading. The same title transition appears when naturally crossing a section boundary. It waits for Continue and does not synthesize new narration.

In More options → Preferences, enable Dark theme. Check reading, sheets, images, maps, full-screen expansion and the primary button. Existing geometry and icons should be unchanged; the preference should survive reload. Audio should keep playing while changing the theme. Image/map expand and description icons should mirror one another at the same height, size and side inset.


Check the safe-area top edge on a phone: two quiet progress rows, then microphone left and menu right. Move forward and backward; the section bead must sit exactly at the fill endpoint. Tap progress and choose a specific thumbnail, Scripture icon or question: it must open that screen directly, without autoplay or an extra section title. Section icons still open their title transitions. Let long Scripture and guide text run: motion should be continuous, and a touch/scroll or Pause must stop it immediately. Test reduced-motion mode separately.


## Glossary discussion boundary

In Filling the Gaps, open gospel (or any other narrated key-term step). The visible text must be the FIA instruction beginning “Stop here and discuss…”, matching the first audio. When that recording ends, wait: no definition audio should start. Continue then shows and reads the glossary definition. When the definition finishes, the app waits again. Pause/resume must preserve this behavior. Reload during the definition phase and revisit using Back to check phase restoration.


## Glass frame

On a small phone, set Reading size to Largest and play a long passage. Text should move underneath the top/bottom glass while the spoken line stays centered between the controls. Manually scroll to check that the first and last lines remain reachable. Check both palettes and a notched/home-indicator device. The top and bottom surfaces should blur content without a divider or fading gradient. Control positions and touch targets remain stable; the glass itself must not intercept scrolling. Reduced transparency should use a readable solid fallback.
