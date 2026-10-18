# Disclosure lab: viewer and results

Interactive viewer: **https://alasleimi.github.io/disclosure-steering-results/**

This repository contains only a static viewer and exported synthetic research
data. The experiment implementation and model weights are not included.

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

`data/overview.json` records the current run status. During execution this is a
progress snapshot; missing responses are pending, and partial results are not
final estimates. The same viewer updates when complete results are pushed.

The scores are lexical proxies. This is not a patient-dialogue evaluation or a
demonstration of medical transfer. Inspect the actual outputs and method notes
before interpreting the aggregate numbers.

To view locally: `python -m http.server 8000`, then open http://localhost:8000.
All assets and JSON files use relative URLs; there is no server-side application.

Published from the `disclosure-steering` branch. No Git LFS is required.
