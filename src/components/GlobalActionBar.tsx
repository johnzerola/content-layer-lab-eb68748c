import { Search } from "lucide-react";

import { openCommandBar } from "@/lib/command-bar";
import { cn } from "@/lib/utils";

/**
 * Barra de ação global: campo compacto no topo que se expande no painel de comandos.
 * Apenas apresentação — a navegação continua no CommandPalette.
 */
export function GlobalActionBar({ className }: { className?: string }) {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  return (
    <button
      type="button"
      onClick={() => openCommandBar()}
      aria-label="Abrir busca e comandos"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "group flex h-10 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left text-muted-foreground transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-[var(--border-hover)] hover:bg-surface-2 active:scale-100",
        className,
      )}
    >
      <Search className="size-4 shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="hidden sm:inline">Pesquisar vídeos, perfis ou comandos…</span>
        <span className="sm:hidden">O que você quer fazer?</span>
      </span>
      <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
