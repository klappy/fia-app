# Hosted ASR DEV build prerequisites

Recipe: cookbook PR180, commit `7f863cca354514bf365f7422d992e16f23f08b19`. This directory implements local file verification and a proposed dedicated DEV configuration generator. It does not activate a Worker, Container, route, migration, secret or paid start.

`proposal.json` records the bounded approved pilot. `inputs.lock.json` records **actual acquired and SHA-256 verified** small multilingual weights at the exact approved revision, and 23 resolved Linux/amd64 CPython 3.12 wheels. `requirements.lock` pins those wheel versions and hashes. The dependency resolver started at faster-whisper 1.2.1; transitive versions are now frozen. Acquisition verifies identity, not runtime compatibility or package safety. Preserve license/notices from the model and each wheel in the eventual image; the final bundle requires a hashed notices artifact.

Large assets live outside Git in `work/hosted-asr-build` relative to the coordination workspace. No speech was recognized. Recheck them with:

```js
import {verifyInputs} from './deploy/hosted-asr/verify.mjs';
console.log(await verifyInputs('/absolute/path/to/work/hosted-asr-build'));
```

Docker is absent on the acquisition host (`docker: command not found`, exit 127). There is no built image, exact base image digest, actual Python patch-version receipt or demonstrated Linux resource enforcement. `lock.template.json` deliberately fails verification. This is an actual missing-runtime blocker, not a claim that acquisition was prohibited.

The next build must use an independently reviewed immutable Linux/amd64 base image, install only the retained hash-locked wheels with network disabled, copy the verified model and recognizer, preserve notices, and measure the real Python/runtime versions. Its image must run nonroot with read-only model files, enforce a 4 GiB process budget and 256 MiB scratch budget, and use CPU/int8 with two threads. The recognizer, private Worker entrypoint, runtime manifest and measured limit receipt must all be retained by hash. The current local reference recognizer has different limits/thread settings and cannot be relabeled as this runtime.

`verifyBundle({directory, lock})` verifies retained files against a completed lock. It checks immutable image names, the exact model file set, wheel hashes, runtime-manifest correspondence and required limit-receipt fields. These receipts are local claims requiring independent review; the verifier cannot establish image authenticity, prove cgroup enforcement or authenticate a review merely from a supplied digest. Its success status is explicitly not deployment authority. `proposedDevConfig` additionally returns a dedicated DEV-only candidate using the verified existing Worker path; no generated config is written or deployed. Runtime `enableInternet=false`, offline model flags, process watchdog/kill verification and private dispatch enforcement belong in the reviewed Worker/image implementation, not in invented Wrangler configuration fields.

The two fixed test ledgers A/B share one durable two-start budget. The `sharedBudget` name here is a contract requirement, not enforcement. Server dispatch/budget/watchdog code is independently owned and must be reviewed with this image before any start. Warm reuse, failure/uncertainty fencing, shutdown evidence and output validation remain required. No public caller key or public ledger selection is introduced. Production/staging and current app Wrangler files are untouched.

Focused tests: `node --test tests/preparation-hosted-asr/locks.test.mjs`. Root test discovery is not changed. Input acquisition did not build/run a container or demonstrate hosted transcription, accepted timing, highlighting, deployment readiness or universal recognition confidence.

## Executable local build handoff

No existing `docker`, `podman`, `nerdctl`, `finch`, `colima` or `limactl` executable was found on PATH; the standard Docker.app CLI path and common Homebrew Docker/Podman/Colima paths were also absent. No runtime was installed. `base-image.lock.json` records the primary Docker registry's Linux/amd64 manifest, whose actual response bytes matched both the selected child digest and the registry digest header. Image layers have **not** been acquired or executed. The Dockerfile uses that immutable digest, not the discovery tag.

`prepare-build.mjs` verifies retained inputs, copies into a new context, then verifies the copies before adding the Dockerfile and recognizer. It performs no build or start. Example from the repository:

```sh
node deploy/hosted-asr/prepare-build.mjs /absolute/path/work/hosted-asr-build /absolute/path/work/hosted-asr-context
```

With an authorized existing Linux container runtime, the next operator can build that context with `docker build --platform linux/amd64 --network=none -t fia-asr-local:review /absolute/path/work/hosted-asr-context`. The base-image retrieval is a separate prerequisite if it is not already local. The pip layer installs only retained wheels using `--no-index --require-hashes`. Record the resulting image digest and actual runtime versions; an image tag is not a deployment pin.

`recognize.py` is an executable single-job container candidate, **not** the HTTP/private hosted dispatch integration. It accepts only the pinned p2 bytes at `/input/source.mp3`; verifies all model bytes; enforces the 16 KiB input, 90-second decoded audio, 2,000-word and 1 MiB output bounds; and sets a 300-second process alarm. It writes candidate words and immutable raw/model/script/decoder identities, never accepted playback ranges. Its local Python validation tests do not load a model. Actual decoding/inference compatibility remains untested.

The proposed local runner must mount `/input` read-only, use an immutable image digest, and supply `--network=none --read-only --memory=4g --memory-swap=4g --cpus=2 --pids-limit=128 --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /scratch:rw,noexec,nosuid,size=268435456,mode=1777`. Copy the result from the bounded scratch mount before removing the stopped container. These are executable Docker settings, **not measured enforcement evidence**. Do not pass `executor.limitsEnforced:true` until independent real-runtime tests prove enforcement. SIGALRM alone cannot prove timely termination of a blocked native library: the separately owned external watchdog must stop the entire process/container and verify stopped state. Container readiness, idle and activation deadlines, durable two-start debit, fixed ledgers, private transport, output validator and image-limit receipts remain integration gates before activation.
