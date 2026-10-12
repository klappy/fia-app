# Verified source stream disk spool

`spoolVerifiedSource({source, openSource, workDirectory, maxBytes, totalMs, signal})` is a Node-only consumer of a trusted producer port. It contains no network acquisition. The exact source descriptor is `{sha256, reference:'originals/sha256/<sha>.mp3', bytes}`. The producer returns that same identity, a ReadableStream of Uint8Array chunks no larger than64KiB, and `verified:Promise<void>` covering its retained-source authority/provenance verification.

The default byte limit remains2MiB. A trusted caller may explicitly opt into at most16MiB. The consumer copies and hashes each bounded chunk, independently counts bytes, and writes a private0600 file inside a private0700 temporary directory. It returns `{path,sha256,bytes,dispose}` only after exact local hash/length and producer verification succeed. Callers must retain custody of the private working directory and dispose after all decoding readers settle; dispose is idempotent. No whole source array is created by the implementation.

A total deadline covers producer opening, stream reads and producer verification. Abort/deadline signals the producer and refuses adoption. Stream cancellation and late producer verification rejections are observed without awaiting an unbounded cancel promise. Local filesystem operations are allowed to settle before close/removal, preventing a late local write from resurrecting deleted files; this is not a hard bound on a hung kernel/filesystem. Producer cancellation does not prove an external task stopped. Failed/aborted files are removed, and late producer-open completion cannot create a new spool.

This is a private adapter component, not an increase in public acquisition, factory artifact, ASR duration or playback limits. Synthetic12.8MiB tests establish streaming mechanics without fetching originals. Root-owned decoder integration and actual source/model evidence are separate.

Run `node --test tests/preparation-executor/source-stream-spool.test.mjs`.
