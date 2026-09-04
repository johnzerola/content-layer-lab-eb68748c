import { useCallback, useSyncExternalStore } from "react";

/**
 * Estado guardado FORA da árvore do React (nível de módulo).
 * Isso mantém a fila e o processamento vivos quando o usuário troca de tela:
 * o componente desmonta, mas o estado (e o loop de render) continua.
 */
export interface ExternalState<T> {
  get: () => T;
  set: (upd: T | ((prev: T) => T)) => void;
  subscribe: (fn: () => void) => () => void;
}

export function externalState<T>(initial: T): ExternalState<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (upd) => {
      const next = typeof upd === "function" ? (upd as (p: T) => T)(value) : upd;
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useExternalState<T>(store: ExternalState<T>): [T, (upd: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  const set = useCallback((upd: T | ((prev: T) => T)) => store.set(upd), [store]);
  return [value, set];
}
