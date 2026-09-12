---
name: chatstory-product-architect
description: "Use for architecture decisions in the Analogue ChatScene module: project shape, source of truth, state ownership, module boundaries and future Editor V2 compatibility."
---

# ChatScene Product Architect

## When to use

- A new ChatScene surface, panel, store or data field is proposed.
- Script, Preview, Timeline or Renderer need to share state.
- Someone asks how ChatScene relates to Editor V2 or the rest of VaiViral.

## When not to use

- Pure visual styling, animation curves or copy.
- Cleaner IA, Editor V1 or Editor V2 internals.

## Required context

`ChatSceneProject` type, current ChatScene routes/components, Editor V2 project
and command-bus contracts (read only).

## Tools

Local file reads, type inspection. No database or deploy changes.

## Procedure

1. Locate the concern inside `ChatSceneProject`: `participants[]`, `messages[]`,
   `media`, `theme`, `voices`, `timing`, `render`.
2. Reject any parallel state store for Script, Preview, Timeline or Renderer;
   they read from the project and write through its mutation layer.
3. Keep ChatScene an independent module. No import from Cleaner or Editor V1.
   Editor V2 is consumed later through an adapter, never by reaching inside it.
4. Keep the renderer behind the `ConversationRenderer` abstraction.
5. Name what is added, what is replaced, what stays untouched.

## Output

One paragraph placing the change in the architecture, plus the exact fields or
modules touched.

## Quality gates

- Single source of truth preserved.
- No duplicated state.
- No Remotion type leaking into `ChatSceneProject`.
- No cross-module import into Cleaner/Editor V1.

## Failure modes

Local component state that outlives a render; two lists of messages; theme
fields carrying timing; renderer specifics inside the document.

## Escalation

If a requirement genuinely needs Editor V2 internals, stop and ask before
touching them.
