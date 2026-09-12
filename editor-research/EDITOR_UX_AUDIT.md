# Editor UX audit

This is a static audit, not a claim from user sessions. It carries forward evidence in `docs/design/EDITOR-PRO-AUDITORIA-FASES-20260909.md`.

| Priority | Finding | Proof required |
|---|---|---|
| BLOCKER | Save/recovery can misrepresent unsaved work | offline/failure/retry/reload task |
| HIGH | Timeline geometry may disagree after offset, zoom or scroll | click/drag task at start/middle/end |
| HIGH | Cross-surface operations may not undo atomically | captions + split + undo/redo |
| HIGH | Multiple panels need responsive validation | 1024, 1280, 1440 and narrow viewports |
| MEDIUM | Advanced panels may obscure common actions | novice task recordings |

Use the task protocol rather than subjective scores. Verify discovery, clicks, undo, feedback, preview, current state, keyboard path and touch target.
