# Android and iPhone feasibility harness (preparation slice)

The isolated preparation slice of cookbook unit `work/queued/2026-10-03-fia-v3-platform-proof`. It gives the native-route choice one small probe and one evidence matrix to fill, without touching the shipped guide. **It is not a native success, and it holds no device evidence.**

Owned paths: `experiments/platform/**` and `tests/platform/**`. Nothing here is imported by the app, the build, the service worker, the server or the release scripts, and no root manifest or lockfile changes. Removing these two folders removes the slice.

## What is here

| File | Does |
|---|---|
| `probe-toolchain.mjs` | Records the actual host, Java/Gradle, Android SDK/adb/emulator/KVM and Xcode/simctl. Missing tools are reported, never filled in. `--require android` or `--require ios` exits 3 with the missing list. Installs nothing. |
| `sample.mjs` | Resolves one accepted bundled recording (`S05-U018`, override with `PLATFORM_SAMPLE_ID`) in place from `apps/web/public` and refuses it unless bytes and SHA-256 match `audio-manifest.json`. |
| `serve.mjs` | Node built-ins only. Serves the shell and the verified sample, with byte ranges so seek behaves as it does from a real host. `node experiments/platform/serve.mjs` (PORT, HOST env). |
| `shell/` | Minimal probe page: manual Play/Pause/Seek, silent restore of the saved position (no autoplay), saving on pause, on hiding and on pagehide, and recovery from a missing, damaged or unavailable store. Each event is logged on screen and at `window.__probe.events`. Storage uses its own key, `fia-platform-probe:v1`, never the guide's. |

The same shell is what each native route wraps, so every route is measured against the same behavior.

## 6B record

| | Disposition |
|---|---|
| Borrow | One accepted bundled recording, read in place and identity-checked against the shipped manifest. No bytes copied. |
| Bend | None. No engine, pack, view or service-worker code is imported; the probe needs only an audio element and a storage record. |
| Break | The legacy apps and the shipped guide are not wrapped or ported. The route is not chosen from familiarity. |
| Beget | A route-neutral probe page plus a toolchain probe, so each candidate route is compared on the same behavior. |
| Bide | SDK installs, accounts, signing, store submission and device purchases wait for their own authority. |
| Build | Only what runs here: the probe, the shell and its self-tests. |

## Commands and results on this host (2026-10-05, Claude Code cloud container)

```
node experiments/platform/probe-toolchain.mjs                    # exit 0, JSON receipt
node experiments/platform/probe-toolchain.mjs --require android  # exit 3
node experiments/platform/probe-toolchain.mjs --require ios      # exit 3
node --test tests/platform/harness.test.mjs                      # 6 pass, 0 fail
npx playwright test -c tests/platform/playwright.config.mjs      # 5 pass, 0 fail
```

Host found: Linux x64, Node v22.22.0, OpenJDK 21.0.11, Gradle 8.14.3. Absent: Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), adb, sdkmanager, emulator, `/dev/kvm`, macOS, Xcode, `xcrun simctl`. No device attached or reachable.

The Playwright run is a **harness self-test**: desktop Chromium headless at a 390×844 viewport. It proves the probe logic: manual play/pause/seek over byte ranges, a silent restore on reopen, no save before the restore finishes, recovery from damaged and cleared storage, and a save on an emulated `visibilitychange`. It is not Android WebView, Android Chrome, iOS WebKit or installed-PWA evidence.

Finding from the self-test: pagehide saves the current position, so a store damaged while the shell is open is overwritten on exit before the next load reads it. Native routes should keep one writer for progress and test damage injected while the app is not running.

## Evidence matrix (to fill on real targets)

Each cell needs the exact target (device model, OS build, browser/WebView version), the command or manual steps, and a receipt. A route is rejected if a required row fails.

| Behavior | Android installed PWA | Android wrapper (WebView) | iPhone Home Screen PWA | iPhone wrapper (WKWebView) |
|---|---|---|---|---|
| Install / launch | open | open | open | open |
| Manual play, pause, seek on the sample | open | open | open | open |
| No autoplay on launch or restore | open | open | open | open |
| Background → foreground keeps or pauses audio as designed | open | open | open | open |
| Kill and reopen restores the position silently | open | open | open | open |
| Interrupted save (kill during save) leaves a readable record | open | open | open | open |
| Storage cleared or evicted → clean recovery, no crash | open | open | open | open |
| 200% and 310% text without loss | open | open | open | open |
| Safe areas (notch, home indicator) | open | open | open | open |
| Screen-reader focus order (TalkBack / VoiceOver) | open | open | open | open |
| Fullscreen video exit keeps controls usable (open bug, alpha11 change unverified) | open | open | open | open |

Executed here: none of the device cells. Only the harness logic above.

## Prerequisites to run the open cells

- **Android emulator:** an x86_64 Linux host with `/dev/kvm`, or macOS. Android SDK command-line tools with `platform-tools`, `emulator` and one system image, plus `ANDROID_HOME` set. Then `--require android` exits 0.
- **Android device:** USB or Wi-Fi debugging with `adb devices` listing it. Serve the shell on a LAN address (`HOST=0.0.0.0`) or forward it with `adb reverse tcp:4180 tcp:4180`.
- **iPhone simulator:** a macOS host with Xcode and an iOS runtime. Then `--require ios` exits 0, and `xcrun simctl openurl booted http://127.0.0.1:4180` opens the shell.
- **Physical iPhone:** Safari to a reachable HTTPS host, or a Mac with Web Inspector for event logs. A Home Screen PWA needs HTTPS. Signing a wrapper needs an Apple developer account, which this slice does not provision.
- **Wrappers** (Capacitor, TWA, a hand-made WKWebView/WebView) are compared only after the PWA rows exist. Each wrapper's project lives under `experiments/platform/<route>/` with its own local dependencies.

## Next smallest action

Run `--require android` on a host with KVM and an Android SDK (or an attached device), serve the shell, and fill the Android installed-PWA column. Do the same for iPhone on a Mac with Xcode, or on the physical iPhone where the fullscreen bug was reported.
