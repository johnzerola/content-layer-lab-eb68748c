/**
 * Canal simples para abrir a Global Action Bar (⌘K) de qualquer lugar da UI.
 * Não guarda estado de negócio — só o sinal de abrir/fechar o painel de comandos.
 */
const EVENT = "vaiviral:command-bar";

export function openCommandBar(query?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { query } }));
}

export function onCommandBar(handler: (query?: string) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent).detail?.query);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
