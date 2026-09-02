import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, CornerDownLeft, Keyboard, Loader2, Search } from "lucide-react";

import { openCommandBar, onCommandBar } from "@/lib/command-bar";
import { COMMAND_ACTIONS, SHORTCUT_HINT } from "@/lib/command-actions";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "done";

/**
 * Global Action Bar com VaiViral Aurora Effect.
 * A barra compacta MORPHA para o command center — não abre um modal separado.
 * Apenas apresentação: a navegação continua igual.
 */
export function GlobalActionBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [chip, setChip] = useState<{ label: string; phase: Phase } | null>(null);
  const [boost, setBoost] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_ACTIONS.slice();
    return COMMAND_ACTIONS.filter((a) =>
      `${a.group} ${a.label}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openCommandBar();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const off = onCommandBar((q) => {
      setOpen(true);
      if (q) setQuery(q);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, []);

  function run(to: string, label: string) {
    // 12 · a aurora acelera por ~500ms para sinalizar que o comando foi recebido
    setBoost(true);
    setChip({ label, phase: "running" });
    window.setTimeout(() => setBoost(false), 500);
    window.setTimeout(() => {
      setChip({ label, phase: "done" });
      void navigate({ to: to as never });
    }, 420);
    window.setTimeout(() => {
      setChip(null);
      setOpen(false);
      setQuery("");
    }, 1000);
  }

  return (
    <div className={cn("relative", open && "z-[55]", className)}>
      {open && (
        <button
          type="button"
          aria-label="Fechar comandos"
          tabIndex={-1}
          className="fixed inset-0 -z-10 cursor-default bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn(
          "aurora rounded-xl border bg-surface transition-[transform,border-color,background-color,box-shadow] duration-[var(--dur-panel)] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open
            ? "aurora-on scale-[1.015] border-transparent bg-surface-2 shadow-[var(--shadow-float)]"
            : "border-border hover:border-[var(--border-hover)] hover:bg-surface-2",
          boost && "aurora-boost",
        )}
      >
        {open ? (
          <div className="flex h-11 items-center gap-2.5 px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {chip ? (
              <span
                className={cn(
                  "pop-in inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[13px]",
                  chip.phase === "done"
                    ? "border-[color-mix(in_oklab,var(--success)_35%,transparent)] text-success"
                    : "border-border text-foreground",
                )}
              >
                {chip.phase === "done" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                <span className="truncate">{chip.label}</span>
              </span>
            ) : (
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    const item = results[active];
                    if (item) run(item.to, item.label);
                  }
                }}
                placeholder="Pesquisar vídeos, perfis ou comandos…"
                aria-label="Pesquisar vídeos, perfis ou comandos"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-[var(--muted-2)]"
              />
            )}
            <kbd className="hidden shrink-0 items-center gap-1 rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              <CornerDownLeft className="size-3" /> abrir
            </kbd>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openCommandBar()}
            aria-label="Abrir busca e comandos"
            aria-keyshortcuts="Meta+K Control+K"
            className="group flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-muted-foreground"
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
        )}

        {/* 9 · o painel cresce a partir da própria barra */}
        {open && (
          <div className="max-h-[min(60vh,420px)] origin-top overflow-y-auto border-t border-border px-1.5 py-1.5">
            {results.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                Nada encontrado para “{query}”.
              </p>
            )}
            {results.map((a, i) => (
              <button
                key={a.to}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(a.to, a.label)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  i === active ? "bg-surface-3 text-foreground" : "text-muted-foreground",
                )}
                style={
                  i < 6
                    ? {
                        animation: `vv-rise var(--dur-base) var(--ease-out-expo) ${i * 28}ms both`,
                      }
                    : undefined
                }
              >
                <a.icon className="size-4 shrink-0 opacity-80" />
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                {SHORTCUT_HINT[a.to] && (
                  <kbd className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-2)]">
                    {SHORTCUT_HINT[a.to]}
                  </kbd>
                )}
              </button>
            ))}
            <div className="mt-1 flex items-center gap-1.5 border-t border-border px-2.5 pt-2 text-[11px] text-[var(--muted-2)]">
              <Keyboard className="size-3.5" />
              pressione <span className="font-mono">?</span> para ver todos os atalhos
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
