import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  HardDrive,
  Images,
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

const ACTIONS = [
  { to: "/", label: "Estúdio (lote, cortes, limpeza)", icon: Layers, group: "Criar" },
  { to: "/live", label: "Monitorar lives", icon: Radio, group: "Criar" },
  { to: "/fotos", label: "Fotos", icon: Images, group: "Criar" },
  { to: "/biblioteca", label: "Biblioteca de resultados", icon: Library, group: "Processar" },
  { to: "/armazenamento", label: "Armazenamento", icon: HardDrive, group: "Processar" },
  { to: "/agenda", label: "Agenda de publicações", icon: CalendarClock, group: "Publicar" },
  { to: "/perfis", label: "Perfis conectados", icon: Users, group: "Publicar" },
  { to: "/integracoes", label: "Integrações", icon: Settings2, group: "Publicar" },
  { to: "/metricas", label: "Métricas", icon: BarChart3, group: "Analisar" },
] as const;

/** Paleta de comandos global (⌘K / Ctrl+K) para as ações frequentes. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(ACTIONS.map((a) => a.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Para onde você quer ir?" />
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
                <a.icon className="mr-2 size-4 text-primary" />
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
