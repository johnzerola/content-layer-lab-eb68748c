# Temporal background recovery

**Source:** Adobe Project Cloak public description; ProPainter paper and source.

**Idea:** within a shot, seek reliable observations of the hidden background in
past and future frames before synthesizing unknown pixels.

**Evidence:** Adobe confirms this as a Project Cloak principle; ProPainter is a
separate learned implementation. Neither establishes Cleaner performance.

**License:** ideas from published factual descriptions; no proprietary source or
output is reused. Any candidate implementation/weight keeps its own license.

**Cleaner application:** a confidence-scored reference selector before the
inpainting engine.

**Experiment:** compare fixed-window references with visibility- and
forward/backward-consistency-gated references on held-out scene-safe cases.
