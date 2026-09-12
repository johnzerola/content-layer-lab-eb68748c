---
name: asset-license-gate
description: "Use before adding any dependency, asset, media, font, sticker or model to the project. Unknown license is blocked."
---

# Asset License Gate

## When to use

Any new package, font, sound, sticker, image, Lottie file, ML model or dataset.

## When not to use

Code written inside this project.

## Required context

`src/lib/editor/asset-catalog.ts`, the license matrix document, package
metadata.

## Tools

Web search for the upstream license; local reads.

## Procedure

1. Record for every item: `source`, `license`, `commercialUse`, `attribution`,
   `author`, `version`.
2. Verify the license at the upstream source, not from memory.
3. Check model weights separately from code — a permissive repository can ship
   non-commercial weights.
4. Unknown, ambiguous or non-commercial license for commercial use = BLOCKED.
   Say so and propose an alternative.
5. Attribution-required items must have a visible attribution plan before use.
6. Append the entry to the license matrix.

## Output

A matrix row per item plus an ALLOWED / BLOCKED verdict.

## Quality gates

No item ships without all six fields; no BLOCKED item reaches the app.

## Failure modes

Assuming MIT because the repository is popular; ignoring weight licenses;
promoting an asset with unverified origin.

## Escalation

Blocked items go to the user with the reason and at least one alternative.
