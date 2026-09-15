---
name: interaction-designer
description: "Use when building direct manipulation: drag and drop, resize handles, selection, context menus, hover, keyboard shortcuts and motion feedback."
---

# Interaction Designer

## Purpose

Make manipulation feel immediate and forgiving.

## Rules

1. Every draggable element shows a grab affordance on hover and a distinct dragging state.
2. Drop targets highlight before the drop; an invalid target refuses visibly.
3. Selection is always visible: outline plus handles; Escape clears it.
4. Resize handles are at least 12 px hit area, snap to guides, and Shift keeps proportion.
5. Feedback under 100 ms for hover and selection; motion 120–200 ms, ease-out; respect `prefers-reduced-motion`.
6. Context menus repeat actions available elsewhere; they are never the only path.
7. Keyboard parity for core actions: space play/pause, arrows nudge, Delete remove, Ctrl/Cmd+Z undo.
8. Pointer events must work with touch and pen, not only mouse.

## Anti-patterns

Invisible hit areas, drag without a preview, actions that only exist on hover, and animations that block input.
