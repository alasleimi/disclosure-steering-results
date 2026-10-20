# Disclosure lab: viewer and results

Interactive viewer: **https://alasleimi.github.io/disclosure-steering-results/**

This repository contains only a static viewer and exported synthetic research
data. The experiment implementation and model weights are not included.

<!-- V3_RESULT_START -->
## Grounded exhibits: length and prefix controls

[Open the new experiment](https://alasleimi.github.io/disclosure-steering-results/grounded/).
The dataset contains 480 distinct records across 12 named exhibit types.
There are 303 answer-body contrasts from 160 training records, each repeated
under two opener families: 606 pairs with exactly matched token counts.
Required facts and allowed context are annotated separately.

The viewer currently shows a progress snapshot. Block 11 and alpha 1 are fixed;
eight conditions will be compared on 96 validation and 192 test records.
Full-answer pooling and a same-fact length-only direction are explicit controls.
These controls test possible biases; they do not guarantee a disentangled vector.
<!-- V3_RESULT_END -->

<!-- V2_RESULT_START -->
## Measured v2 result

Completed: **150 reviewed contrast pairs from 107 training cases**, **96 validation cases**,
**192 held-out test cases**, and **9,600 evaluated responses** across the full sweep and controls.
Validation selected zero-based block **11**, strength **1**; response averaging was fixed before the sweep.
Steering changed **190/192 conversations**.

| Condition | Premature fact fraction | Requested coverage |
|---|---:|---:|
| Baseline | 25.78% | 96.58% |
| Selected steering | 23.70% | 93.95% |
| Opposite direction | 28.52% | 95.83% |
| Selective instruction | 26.69% | 97.20% |
| Brevity instruction | 20.96% | 98.21% |
| Oracle masking | 0.78% | 94.30% |

**Selected steering did not demonstrate improved disclosure control.**
Premature disclosure changed by -2.08 percentage points (paired 95% interval [-4.43, +0.39]).
Requested coverage changed by -2.64 percentage points (paired 95% interval [-4.46, -0.94]).
The leakage reduction is inconclusive; the coverage loss is clearer. The validation rule recommended baseline.
The brevity instruction performed better on both lexical measures in this run: 21.0% premature fact fraction and 98.2% requested coverage. Its paired intervals exclude zero for both improvements; this remains an exploratory synthetic result.

The transcript audit covers 288 responses from 12 cases sampled before test generation, across all six conditions.
It identifies unsupported details, wrong-subject matches, partial-date omissions and both false positive and missed material flags.
These are assistant judgments, not independent human annotations. The published scores remain the fixed lexical scores.
Compare conditions within this run: records, question families and precision differ from the original pilot.

<!-- V2_RESULT_END -->

<!-- STRENGTH_RESULT_START -->
## Large-strength follow-up

**Exploratory results on the same 96 validation cases**, at fixed block 11.
Baseline and alpha 1/2 reuse original saved conversations; alpha 4/16/64/256 are new.
This is a separate follow-up, not a replacement for the held-out results above.

| Alpha | Premature fraction | Requested coverage | Token cutoff |
|---:|---:|---:|---:|
| 0 | 22.92% | 96.42% | 1.04% |
| 1 | 21.09% | 96.09% | 0.52% |
| 2 | 17.71% | 89.97% | 4.95% |
| 4 | 19.01% | 64.32% | 22.92% |
| 16 | 0.00% | 0.00% | 100.00% |
| 64 | 0.00% | 0.00% | 100.00% |
| 256 | 0.00% | 0.00% | 100.00% |

[Inspect the strength sweep and outputs](https://alasleimi.github.io/disclosure-steering-results/#strength).
Read coverage and cutoffs alongside leakage: repetitive output with no facts is not successful selective disclosure.
<!-- STRENGTH_RESULT_END -->

[All responses and scores](data/test.json) · [Complete run artifacts](data/experiment-artifacts.zip) · [Training drafts and review](data/training-drafts.zip)

The study uses Qwen2.5-0.5B-Instruct on 192 training, 96 validation and 192 test
museum-object records, with four turns per case. Generated contrast answers are
filtered for their measured disclosure behavior, coverage, prefix overlap,
length mismatch, repetition and cutoffs. The exact recipe, per-response scores,
matching evidence and uncertainty estimates are inspectable in the viewer.

An assistant semantic audit reviewed every automatically accepted contrast pair.
It excluded 90 of 240 automatic passes, retaining 150 pairs from 107 training
cases. Original answers and all rejection reasons remain in the viewer. This is
not independent human annotation. Validation and test records were unchanged.

Drafts were generated in BF16. Activation extraction and evaluation use FP32;
the full numerical-check results and both execution identities are recorded.
The validation sweep compares 12 steering settings plus baseline on 96 cases.
The test compares six conditions on the same 192 cases, using paired case
bootstrap intervals and a transcript audit sampled before test generation.

`data/training-drafts.zip` contains exact drafts, token IDs, review decisions and
provenance for reproduction. Completed-run downloads include raw transcripts
and compact steering vectors, without full model weights or implementation code.

`data/overview.json` records the completed run, provenance, metrics and audit.
All 1,248 validation conversations and 1,152 test conversations are available;
each has four scored responses. Archive SHA-256 hashes are recorded in the overview.

The scores are lexical proxies. This is not a patient-dialogue evaluation or a
demonstration of medical transfer. Inspect the actual outputs and method notes
before interpreting the aggregate numbers.

To view locally: `python -m http.server 8000`, then open http://localhost:8000.
All assets and JSON files use relative URLs; there is no server-side application.

Published from the `disclosure-steering` branch. No Git LFS is required.
