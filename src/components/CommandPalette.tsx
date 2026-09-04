import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { SHORTCUTS, registerShortcuts } from "@/lib/shortcuts";

/**
 * Atalhos globais + ajuda de teclado.
 * A busca em si vive na Global Action Bar (morph, sem modal separado).
 */
export function CommandPalette() {
  const [help, setHelp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    return registerShortcuts({
      navigate: (to) => void navigate({ to: to as never }),
      onHelp: () => setHelp(true),
    });
  }, [navigate]);

  if (!help) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => setHelp(false)}
    >
      <div
        className="pop-in w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-foreground">
            Atalhos de teclado
          </h2>
          <button
            type="button"
            onClick={() => setHelp(false)}
            className="min-h-11 rounded-lg px-3 text-[13px] text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            Fechar
          </button>
        </div>
        <ul className="mt-3 divide-y divide-border/70">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13px] text-muted-foreground">{s.label}</span>
              <kbd className="rounded border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] text-foreground">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
