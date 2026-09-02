/** Estado do editor de templates: seleção, camadas, histórico e autosave. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorHistory } from "@/components/editor/useEditorHistory";
import { uid } from "./factory";
import type { TemplateDoc, TemplateLayer } from "./types";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useTemplateEditor(initial: TemplateDoc) {
  const history = useEditorHistory<TemplateDoc>(initial);
  const doc = history.state;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layers = useMemo(() => [...doc.layers].sort((a, b) => a.zIndex - b.zIndex), [doc.layers]);
  const selected = useMemo(() => doc.layers.find((l) => l.id === selectedId) ?? null, [doc.layers, selectedId]);

  const patchDoc = useCallback(
    (patch: Partial<TemplateDoc>, label = "documento") => history.set((d) => ({ ...d, ...patch }), label),
    [history],
  );

  const addLayers = useCallback(
    (next: TemplateLayer[]) => {
      history.set((d) => ({ ...d, layers: [...d.layers, ...next] }), `add-${uid()}`);
      const last = next[next.length - 1];
      if (last) setSelectedId(last.id);
    },
    [history],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<TemplateLayer>, label = `layer:${id}`) => {
      history.set(
        (d) => ({
          ...d,
          layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as TemplateLayer) : l)),
        }),
        label,
      );
    },
    [history],
  );

  const removeLayer = useCallback(
    (id: string) => {
      history.set((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }), `del-${uid()}`);
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [history],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const src = doc.layers.find((l) => l.id === id);
      if (!src) return;
      const copy = {
        ...src,
        id: uid(),
        name: `${src.name} cópia`,
        x: Math.min(95, src.x + 3),
        y: Math.min(95, src.y + 3),
        zIndex: doc.layers.reduce((m, l) => Math.max(m, l.zIndex), 0) + 1,
      } as TemplateLayer;
      history.set((d) => ({ ...d, layers: [...d.layers, copy] }), `dup-${uid()}`);
      setSelectedId(copy.id);
    },
    [doc.layers, history],
  );

  /** Reordena pela lista visual (topo = maior zIndex) e recalcula os zIndex. */
  const reorder = useCallback(
    (orderedIdsBottomFirst: string[]) => {
      history.set(
        (d) => ({
          ...d,
          layers: d.layers.map((l) => {
            const i = orderedIdsBottomFirst.indexOf(l.id);
            return i >= 0 ? { ...l, zIndex: i } : l;
          }),
        }),
        `order-${uid()}`,
      );
    },
    [history],
  );

  return {
    doc,
    layers,
    selected,
    selectedId,
    select: setSelectedId,
    patchDoc,
    setDoc: history.set,
    addLayers,
    updateLayer,
    removeLayer,
    duplicateLayer,
    reorder,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    reset: history.reset,
  };
}

/** Autosave com debounce — nunca salva a cada tecla. */
export function useTemplateAutosave(
  doc: TemplateDoc,
  save: (doc: TemplateDoc) => Promise<void>,
  { delay = 1100, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("dirty");
    const t = setTimeout(async () => {
      setStatus("saving");
      try {
        await saveRef.current(doc);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, delay);
    return () => clearTimeout(t);
  }, [doc, delay, enabled]);

  const saveNow = useCallback(async () => {
    setStatus("saving");
    try {
      await saveRef.current(doc);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [doc]);

  return { status, saveNow };
}

export const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "Salvo",
  dirty: "Não salvo",
  saving: "Salvando...",
  saved: "Salvo",
  error: "Erro ao salvar",
};
