# Associated-effect removal: research design

An overlay is not limited to its glyph pixels. The lab keeps two separate
semantic objects: `primary_overlay_mask` (glyph, stroke or watermark) and
`associated_effect_mask` (shadow, glow, bloom, reflection, transparency or
colour spill). Combining them prematurely would hide whether a gain comes from
better removal or unnecessary background loss.

## Evidence and principle

Adobe's Project Cloak describes dense tracking forward and backward in time to
recover background visible in other frames, with content-aware fill only when
the hidden background is never observed. This supports a recover-first design;
it does not validate an effect detector or disclose Adobe's production model.
[Adobe Research, Project Cloak](https://research.adobe.com/news/cloak-remove-unwanted-objects-in-video/).

## Interface, deliberately gated

`detect_associated_effects(video, overlay_mask, temporal_window)` exposes the
future output contract: primary, shadow, glow, reflection and transparency
masks plus calibrated confidence. Its current result is `RESEARCH_GATE_NOT_EXECUTED`.
No morphology, colour threshold, alpha inversion or arbitrary rule is presented
as a detector.

## Minimum experiment before implementation

Annotate primary and associated regions independently in videos with known
background. Freeze the rules before testing. Compare primary-only against each
associated-effect proposal with the same engine and references. Report
primary/effect residual, unwanted background removal outside the union, temporal
variation, and human review by overlay type. Advance only if held-out cases
reduce residual without a material rise in background loss or flicker.

This is an independent Cleaner design; no protected implementation is copied.
