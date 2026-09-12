---
name: web-video-editor-architect
description: Map and evolve this repository's web video editor architecture without replacing working editor surfaces prematurely.
---

Start with `editor-research/EDITOR_CURRENT_ARCHITECTURE.md` and call `inspect_editor` plus `trace_editor_state`. Treat preview, timeline, canvas, captions, save and render as one project contract only after evidence. Propose typed commands and a shared project clock before refactoring. Keep production changes behind fixture, undo/redo and export validation.
