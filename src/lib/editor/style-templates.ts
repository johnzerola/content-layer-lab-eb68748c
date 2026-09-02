/**
 * TEMPLATES DE ESTILO COMPLETO: cada item junta paleta de cores, tipografia,
 * preset de legenda, animação da legenda e transição do corte. Aplicar um
 * template configura tudo de uma vez no editor — só apresentação, nenhuma
 * regra de negócio nova.
 */
import type { CaptionAnimation } from "@/lib/editor/caption-styles";
import type { TransitionKind } from "@/lib/preedit";

export interface StyleTemplate {
  id: string;
  label: string;
  hint: string;
  /** preset de legenda usado como base */
  presetId: string;
  /** [texto, destaque, contorno] */
  colors: [string, string, string];
  fontFamily: string;
  fontWeight: number;
  uppercase: boolean;
  animation: CaptionAnimation;
  transition: TransitionKind;
  /** classes de gradiente do card */
  gradient: string;
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: "viral-hook",
    label: "Viral Hook",
    hint: "hook agressivo, corte seco",
    presetId: "punch-yellow",
    colors: ["#ffffff", "#ffd93d", "#000000"],
    fontFamily: "Outfit, sans-serif",
    fontWeight: 900,
    uppercase: true,
    animation: "bounce",
    transition: "punch",
    gradient: "from-amber-400/70 to-rose-500/40",
  },
  {
    id: "tiktok-neon",
    label: "TikTok Neon",
    hint: "ciano e rosa, ritmo rápido",
    presetId: "verde-impacto",
    colors: ["#ffffff", "#25f4ee", "#fe2c55"],
    fontFamily: "Figtree, sans-serif",
    fontWeight: 800,
    uppercase: true,
    animation: "pop",
    transition: "whip",
    gradient: "from-cyan-400/70 to-pink-500/40",
  },
  {
    id: "podcast-clean",
    label: "Podcast Clean",
    hint: "leitura confortável",
    presetId: "podcast-bold",
    colors: ["#ffffff", "#7c5cff", "#0b0b12"],
    fontFamily: "Figtree, sans-serif",
    fontWeight: 700,
    uppercase: false,
    animation: "fade",
    transition: "fade",
    gradient: "from-primary/60 to-indigo-500/30",
  },
  {
    id: "news-urgente",
    label: "Notícia Urgente",
    hint: "manchete e caixa escura",
    presetId: "subtitle-box",
    colors: ["#ffffff", "#ff3b30", "#0a0a0a"],
    fontFamily: "Arial Black, sans-serif",
    fontWeight: 900,
    uppercase: true,
    animation: "slide",
    transition: "slide-up",
    gradient: "from-red-500/60 to-slate-700/40",
  },
  {
    id: "cinema-serif",
    label: "Cinema",
    hint: "editorial, transição suave",
    presetId: "minimal-white",
    colors: ["#f6f1e7", "#e0b872", "#000000"],
    fontFamily: "Instrument Serif, Georgia, serif",
    fontWeight: 600,
    uppercase: false,
    animation: "fade",
    transition: "drift",
    gradient: "from-amber-200/50 to-stone-700/40",
  },
  {
    id: "gaming-glow",
    label: "Gaming Glow",
    hint: "verde neon com brilho",
    presetId: "verde-impacto",
    colors: ["#eaffff", "#39ff14", "#04120a"],
    fontFamily: "JetBrains Mono, monospace",
    fontWeight: 700,
    uppercase: true,
    animation: "glow",
    transition: "zoom",
    gradient: "from-emerald-400/70 to-lime-500/30",
  },
  {
    id: "business-pro",
    label: "Business Pro",
    hint: "sóbrio para institucional",
    presetId: "subtitle-box",
    colors: ["#ffffff", "#4cc9f0", "#06121b"],
    fontFamily: "Figtree, sans-serif",
    fontWeight: 600,
    uppercase: false,
    animation: "fade",
    transition: "slide-left",
    gradient: "from-sky-400/60 to-slate-800/40",
  },
  {
    id: "retro-pop",
    label: "Retrô Pop",
    hint: "anos 90, cores quentes",
    presetId: "clean-bold",
    colors: ["#fdf0d5", "#ef476f", "#20123a"],
    fontFamily: "Impact, sans-serif",
    fontWeight: 900,
    uppercase: true,
    animation: "shake",
    transition: "swing",
    gradient: "from-rose-400/70 to-purple-600/40",
  },
  {
    id: "minimal-mono",
    label: "Minimal Mono",
    hint: "preto e branco discreto",
    presetId: "minimal-white",
    colors: ["#ffffff", "#c9c9c9", "#000000"],
    fontFamily: "Figtree, sans-serif",
    fontWeight: 600,
    uppercase: false,
    animation: "fade",
    transition: "fade",
    gradient: "from-zinc-300/50 to-zinc-800/40",
  },
  {
    id: "hype-trap",
    label: "Hype Trap",
    hint: "beat forte, karaokê",
    presetId: "rainbow-flow",
    colors: ["#ffffff", "#ff5da2", "#0a0410"],
    fontFamily: "Outfit, sans-serif",
    fontWeight: 900,
    uppercase: true,
    animation: "scale",
    transition: "zoom-out",
    gradient: "from-fuchsia-500/70 to-violet-700/40",
  },
  {
    id: "story-emocional",
    label: "Emocional",
    hint: "depoimentos e histórias",
    presetId: "clean-bold",
    colors: ["#fff7f2", "#ffb4a2", "#160b09"],
    fontFamily: "Instrument Serif, Georgia, serif",
    fontWeight: 600,
    uppercase: false,
    animation: "typewriter",
    transition: "fade",
    gradient: "from-orange-300/60 to-rose-500/30",
  },
  {
    id: "ice-tech",
    label: "Ice Tech",
    hint: "tecnologia e tutoriais",
    presetId: "clean-bold",
    colors: ["#f4faff", "#4cc9f0", "#081018"],
    fontFamily: "JetBrains Mono, monospace",
    fontWeight: 700,
    uppercase: true,
    animation: "slide",
    transition: "slide-right",
    gradient: "from-cyan-300/60 to-blue-700/40",
  },
];
