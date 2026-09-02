import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  HardDrive,
  Images,
  Keyboard,
  Layers,
  Library,
  Radio,
  Settings2,
  Users,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { onCommandBar } from "@/lib/command-bar";
import { SHORTCUTS, registerShortcuts } from "@/lib/shortcuts";

const ACTIONS = [
  { to: "/", label: "Estúdio (lote, cortes, limpeza)", icon: Layers, group: "Ações rápidas" },
  { to: "/fotos", label: "Fotos em lote", icon: Images, group: "Ações rápidas" },
  { to: "/live", label: "Monitorar lives", icon: Radio, group: "Ações rápidas" },
  { to: "/biblioteca", label: "Biblioteca de resultados", icon: Library, group: "Produção" },
  { to: "/armazenamento", label: "Armazenamento", icon: HardDrive, group: "Produção" },
  { to: "/agenda", label: "Agenda de publicações", icon: CalendarClock, group: "Distribuição" },
  { to: "/perfis", label: "Perfis conectados", icon: Users, group: "Distribuição" },
  { to: "/integracoes", label: "Integrações", icon: Settings2, group: "Distribuição" },
  { to: "/metricas", label: "Métricas", icon: BarChart3, group: "Distribuição" },
] as const;

const SHORTCUT_HINT: Record<string, string> = {
  "/": "G I",
  "/agenda": "G A",
  "/biblioteca": "G B",
  "/perfis": "G P",
  "/metricas": "G M",
  "/live": "G L",
  "/fotos": "G F",
};

/** Paleta de comandos global (⌘K / Ctrl+K) para as ações frequentes. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    const offBar = onCommandBar(() => setOpen(true));
    const offShortcuts = registerShortcuts({
      navigate: (to) => void navigate({ to: to as any }),
      onHelp: () => setHelp(true),
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      offBar();
      offShortcuts();
    };
  }, [navigate]);

  const groups = Array.from(new Set(ACTIONS.map((a) => a.group)));

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Pesquisar vídeos, perfis ou comandos…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <CommandItem
                  key={a.to}
                  value={`${a.group} ${a.label}`}
                  onSelect={() => {
                    setOpen(false);
                    void navigate({ to: a.to });
                  }}
                >
                  <a.icon className="mr-2 size-4 text-muted-foreground" />
                  <span className="flex-1">{a.label}</span>
                  {SHORTCUT_HINT[a.to] && (
                    <kbd className="ml-2 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-2)]">
                      {SHORTCUT_HINT[a.to]}
                    </kbd>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Ajuda">
            <CommandItem
              value="atalhos de teclado"
              onSelect={() => {
                setOpen(false);
                setHelp(true);
              }}
            >
              <Keyboard className="mr-2 size-4 text-muted-foreground" />
              <span className="flex-1">Atalhos de teclado</span>
              <kbd className="ml-2 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-2)]">
                ?
              </kbd>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {help && (
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
      )}
    </>
  );
}
