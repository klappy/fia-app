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
