/**
 * HistoryStore — desfazer/refazer do documento.
 *
 * Guarda apenas fotos do ChatSceneProject; nenhuma outra parte do estúdio
 * (seleção, reprodução, interface) entra aqui.
 */
import type { ChatSceneProject } from "./types";

export interface HistoryState {
  past: ChatSceneProject[];
  present: ChatSceneProject;
  future: ChatSceneProject[];
}

export const HISTORY_LIMIT = 60;

export function createHistory(present: ChatSceneProject): HistoryState {
  return { past: [], present, future: [] };
}

export function pushHistory(state: HistoryState, next: ChatSceneProject): HistoryState {
  if (next === state.present) return state;
  const past = [...state.past, state.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [] };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function undo(state: HistoryState): HistoryState {
  if (!canUndo(state)) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
  };
}

export function redo(state: HistoryState): HistoryState {
  if (!canRedo(state)) return state;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: state.future.slice(1),
  };
}
