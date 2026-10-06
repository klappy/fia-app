# FIA cue role experiment version 1

Status: proposed experiment, not a run or production gate. No model calls, paid generation or measured savings are claimed. Scope is semantic classification during server compilation for the active passage flow, not conversational UI or per-tap model inference.

## Question and contract

Contract identity: fia-cue-role@1. Given one source unit and its neighboring context, classify its required reading, discussion, resource-lookup and pause-only roles. Compound cues are legal: the gospel instruction includes discussion and resource lookup, so a single exclusive label would lose meaning.

Each input contains caseId, source unit ID/text/hash, adjacent source units, language, pack/source revision and trusted explicit resource bindings if any. Source text is data, never model instructions. No executable markup is accepted. Output schema is cue-role-v1.schema.json; it describes normalized decisions, not an asserted Jev vendor wire format.

Ask bounded typed yes/no questions for the roles, retaining probability/margin in a separate evaluation envelope if the provider supplies them. Use needsReview when context is insufficient, a candidate binding conflicts or confidence is below a threshold calibrated on held-out cases. Do not invent confidence numbers or choose a production threshold before measurement.

Definitions:

- readingRequested: explicitly requests a Scripture reading/listening action, not merely a Scripture mention.
- discussionRequested: explicitly asks for group discussion/response, including discussion after another action.
- resourceLookupRequested: explicitly asks to consult/view a resource, not merely mentions a related noun.
- pauseOnly: contains only a transport/wait cue, with no substantive instruction; must be false when any of the three other roles is true.
- needsReview: the evidence or calibrated decision is insufficient. An abstention is acceptable; silently dropping a required instruction is not.

Evidence unit IDs must be drawn from the supplied input, checked in code. Jev does not author new Scripture, narration, phase order or glossary definitions. Phase templates follow reviewed product rules. Future resource-binding and reading-parameter extraction questions need separate contracts.

## Worked seed cases

| Seed | Expected roles | Why |
| --- | --- | --- |
| S01-U002, Hear and Heart | reading=true, discussion=true, lookup=false, pauseOnly=false | Reading instruction followed by an explicit group discussion instruction. |
| S05-U004, gospel instruction | reading=false, discussion=true, lookup=true, pauseOnly=false | Discussion and glossary consultation are substantive; the ending pause does not make the whole clip disposable. |
| Authored fixture containing only a pause cue | reading=false, discussion=false, lookup=false, pauseOnly=true | Synthetic edge case, explicitly labeled; not represented as FIA source text. |
| A Scripture quotation without an instruction | all roles false, pauseOnly=false | Content is not automatically a request to play a reading. |
| Truncated or conflicting instruction | needsReview=true | Do not force a definite semantic label from insufficient evidence. |

## Bounded evaluation

Prepare 24 reviewed cases: 8 development examples and 16 held-out cases split across English and Spanish, multiple pericopes, compound cues, plain statements and isolated pauses. Reserve Mark examples above for development; include another pericope in held-out cases. The fixture descriptions above are seeds, not a completed labeled dataset. Language-competent review is required for Spanish gold labels; if unavailable, hold that lane rather than use unverified labels.

Compare deterministic rules alone against the same rules with Jev for unresolved cases. A larger-model comparator is optional and must fit a separately authorized spend cap; it is not required for the first test. Compare each method on the same cases, with the same supplied context and labels.

Proposed pilot ceilings: 30 minutes wall time, at most 24 case evaluations and 96 primitive questions, no automatic retries, and at most 500 input tokens per case per primitive (maximum 48,000 input tokens). Oversize cases are reported, never silently truncated. Provider batching semantics may reduce HTTP calls; count logical questions as well as requests. A dollar ceiling remains unset until verified pricing/access are available; paid execution is blocked until that ceiling is set. These are proposed maxima, not money spent or permission to charge.

Report serious errors first: any substantive instruction classified as pause-only, any dropped required action, or unjustified confident classification. Also report per-role precision/recall, abstentions, review workload, latency, tokens and total cost per correctly resolved case. Show English and Spanish separately. This small pilot can falsify the approach or justify broader testing; it cannot certify all languages or pericopes. No accepted severe errors in the pilot; passing does not establish a universal threshold.

## Deterministic checks and decision

Validate schema; verify evidence IDs exist; reject pauseOnly with another positive role; preserve every source unit; run generated phase traces against the active automatic/manual behavior. Separate model classification evaluation from engine correctness tests. Use original source bindings without a model when explicit and valid.

If Jev improves accuracy or reduces total work at acceptable cost, expand only the passing case classes. Otherwise refine the contract or retain rules/review. Cache accepted outputs by source/context hashes, language, contract version and model configuration. Changed input invalidates affected decisions. Keep a fresh held-out set after using failures to tune the next contract version.

Record contract version, outcome, model/configuration, confidence when available, escalation, latency and token/cost totals. Runtime telemetry excludes source text; reviewed source cases remain governed compiler evidence. No frontend model dependency is introduced.
