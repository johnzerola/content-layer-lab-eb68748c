import { useCallback, useEffect, useRef, useState } from "react";

import {
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  createHistory,
  pushHistory,
  redo as redoOf,
  undo as undoOf,
  type HistoryState,
} from "@/lib/chatscene/history";
import type { ChatSceneProject } from "@/lib/chatscene/types";

/**
 * Desfazer/refazer do documento, sem duplicar estado: o projeto continua
 * vivendo no estúdio; aqui só guardamos as fotos anteriores dele.
 */
export function useProjectHistory(
  project: ChatSceneProject,
  setProject: (p: ChatSceneProject) => void,
) {
  const [history, setHistory] = useState<HistoryState>(() => createHistory(project));
  const applying = useRef(false);

  useEffect(() => {
    if (applying.current) {
      applying.current = false;
      return;
    }
    setHistory((prev) => (prev.present === project ? prev : pushHistory(prev, project)));
  }, [project]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (!canUndoOf(prev)) return prev;
      const next = undoOf(prev);
      applying.current = true;
      setProject(next.present);
      return next;
    });
  }, [setProject]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (!canRedoOf(prev)) return prev;
      const next = redoOf(prev);
      applying.current = true;
      setProject(next.present);
      return next;
    });
  }, [setProject]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { undo, redo, canUndo: canUndoOf(history), canRedo: canRedoOf(history) };
}
