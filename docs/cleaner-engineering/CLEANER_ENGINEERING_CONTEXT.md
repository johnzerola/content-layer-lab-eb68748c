# Cleaner engineering context

This is the compact, stable context shared by Cleaner engineering specialists. Mutable experiment outcomes belong in milestones and `research/experiments/`, not here.

## Invariants

- `CLEANER_GOLDEN_V4` is the immutable quality oracle and maximum fallback. It is not automatically the path for every frame. Each comparison must cite the case-specific artifact and hashes because the repository has no single canonical Golden manifest yet.
- Work stays inside the authorized user selection. Preserve full resolution, create a lossless RGB master before delivery encoding, and retain frame geometry, FPS/PTS, duration, and audio unless the frozen contract states otherwise.
- Pixel provenance is `OBSERVED` (original source pixel), `PROPAGATED` (observed pixel mapped from another frame with retained source/confidence), `GENERATED` (synthetic estimate), or `UNKNOWN` (unresolved). Never call generated pixels known. Prefer observed, then high-confidence propagated, then generated.

## E1, E2, and E3

- **E1 — mask and evaluation truth:** establish presence, clean frames, core/glyph, stroke/outline, shadow, glow, fades, synthetic GT, and holdout. Archive user selection, evaluation/detection mask, engine inference mask, final composition support, and alpha separately. E1 freezes truth; it does not approve reconstruction.
- **E2 — real-reference recovery:** use same-scene donors with motion, forward/backward or cycle checks, occlusion, photometric consistency, consensus, confidence, and source maps. Subtitle-contaminated pixels remain uncertain without independent proof. Never cross cuts or force coverage. Unresolved support routes to E3.
- **E3 — temporal reconstruction:** synthesize only the remaining unknown support with frozen E1/E2 inputs, explicit context/precision/geometry, and no silent resize, fallback, or finisher. Add performance work only after a credible quality candidate exists or when capacity is the isolated experiment.

## Quality and experiment rules

- Locate the earliest failing stage: mask, donor/reference, motion/occlusion, inference, propagation, composition, encode, or delivery.
- Use `QUESTION → falsifiable HYPOTHESIS → FROZEN CONTRACT → ONE MATERIAL CHANGE → MEASURE → independent QUALITY REVIEW → PASS/RETEST/REJECT → MILESTONE`.
- Do not change mask, engine, resolution, composition, encode, and finisher together. Static and temporal quality are separate. A Level 3 structural defect is an immediate reject; a finisher cannot hide it. No scalar, OCR, residue-color proxy, gradient, or temporal error approves a candidate alone.
- Require critical frames, continuous playback where relevant, preservation outside selection, comparable inputs, hashes, provenance, and explicit missing GT/holdout.

## Legal, external systems, and performance

- Track code license, weight license, data/model restrictions, dependency licenses, commercial use, redistribution, modification, and notices independently. `UNKNOWN` remains open. ProPainter currently has an unresolved commercial blocker in [license matrix](../../research/licenses/matrix.md).
- Study VMake and similar systems only through lawful black-box behavior and public sources. Its aligned output is an external visual reference, not hidden-background ground truth or proof of its internal model.
- Targets for a typical 60 s source are `<= ~3 min` warm and `<= ~5 min` cold. These are engineering targets, not promises. Measure cost per successful Golden-like source minute including queue, cold start, load, media stages, transfer, failure, and retry.
- A deployment claim requires an immutable image digest, worker/pipeline revision, effective nonsecret configuration, and matching job evidence. Local code or a health response alone is insufficient.

Current evidence pointers: [research README](../../research/README.md), [research loop](../../research/RESEARCH_LOOP.md), [architecture snapshot](../../research/current-system/architecture.md), [mask semantics](../../research/algorithms/mask-semantics.md), and [experiment records](../../research/experiments/). The architecture snapshot may lag the current HEAD; verify live symbols before asserting current behavior.
