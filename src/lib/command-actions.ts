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

/** Ações de navegação usadas pela Global Action Bar e pela paleta de comandos. */
export const COMMAND_ACTIONS = [
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

export type CommandAction = (typeof COMMAND_ACTIONS)[number];

export const SHORTCUT_HINT: Record<string, string> = {
  "/": "G I",
  "/agenda": "G A",
  "/biblioteca": "G B",
  "/perfis": "G P",
  "/metricas": "G M",
  "/live": "G L",
  "/fotos": "G F",
};
