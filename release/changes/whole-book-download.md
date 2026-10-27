# Whole-book saving: original release and temporary containment

## Proposed containment (PR277; not yet released)

The updated Downloads sheet marks whole-book saving temporarily unavailable and removes its size/check/download controls. Save passages individually using the existing passage controls. The book entry point rejects writes defensively. The original alpha18 behavior below is historical, not an instruction to use controls present in the contained client. Existing old clients/workers require separate lifecycle and worker-boundary verification; the client guard does not retroactively stop old code. This containment does not itself repair or recover a snapshot already replaced.

## Original alpha18 behavior (PR258)

The Downloads sheet originally had a "Save the whole book" card under the passage card. "Check book size" shows the total for each package across every passage of the current book (for example Mark), counting passages already saved and passages whose size is set during download. "Download whole book" then saves each passage in turn with the package chosen above, through the same verified per-passage download as before. Passages already saved at that package (or a larger one) are skipped without a fetch, and a paused or interrupted book download resumes: finished passages are kept and the interrupted passage reuses its verified files. The package radios and their accessible names are unchanged.
