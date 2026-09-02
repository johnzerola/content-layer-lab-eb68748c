/**
 * Atalhos globais de navegação (somente UI — não altera lógica de negócio).
 * Sequência "g" + tecla: g i (estúdio), g a (agenda), g b (biblioteca),
 * g p (perfis), g m (métricas), g l (lives). "?" abre a lista de atalhos.
 */
export const SHORTCUTS: { keys: string; label: string; to?: string }[] = [
  { keys: "⌘K", label: "Abrir paleta de comandos" },
  { keys: "G I", label: "Ir para o estúdio", to: "/" },
  { keys: "G A", label: "Ir para a agenda", to: "/agenda" },
  { keys: "G B", label: "Ir para a biblioteca", to: "/biblioteca" },
  { keys: "G P", label: "Ir para perfis", to: "/perfis" },
  { keys: "G M", label: "Ir para métricas", to: "/metricas" },
  { keys: "G L", label: "Ir para lives", to: "/live" },
  { keys: "?", label: "Mostrar atalhos" },
];

const GO_MAP: Record<string, string> = {
  i: "/",
  a: "/agenda",
  b: "/biblioteca",
  p: "/perfis",
  m: "/metricas",
  l: "/live",
  f: "/fotos",
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

/** Registra os atalhos e devolve a função de limpeza. */
export function registerShortcuts(handlers: {
  navigate: (to: string) => void;
  onHelp: () => void;
}) {
  if (typeof window === "undefined") return () => {};
  let pendingGo = 0;

  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();

    if (key === "?" || (e.shiftKey && key === "/")) {
      e.preventDefault();
      handlers.onHelp();
      return;
    }
    if (key === "g") {
      pendingGo = Date.now();
      return;
    }
    if (pendingGo && Date.now() - pendingGo < 1200 && GO_MAP[key]) {
      e.preventDefault();
      pendingGo = 0;
      handlers.navigate(GO_MAP[key]!);
      return;
    }
    pendingGo = 0;
  };

  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
