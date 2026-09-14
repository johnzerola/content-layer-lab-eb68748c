/** Biblioteca original de estilos de legenda do VaiViral. */
import type { CaptionLayerStyle } from "@/lib/video-template/types";

export type CaptionCategory =
  | "todos"
  | "populares"
  | "basico"
  | "impacto"
  | "minimalista"
  | "podcast"
  | "shorts"
  | "viral"
  | "karaoke"
  | "gaming"
  | "news"
  | "business"
  | "cinema"
  | "retro"
  | "3d"
  | "neon"
  | "manuscrito";

export const CAPTION_CATEGORIES: { id: CaptionCategory; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "populares", label: "Mais usados" },
  { id: "basico", label: "Básico" },
  { id: "impacto", label: "Impacto" },
  { id: "minimalista", label: "Minimalista" },
  { id: "podcast", label: "Podcast" },
  { id: "shorts", label: "Shorts" },
  { id: "viral", label: "Viral" },
  { id: "karaoke", label: "Karaokê" },
  { id: "gaming", label: "Gaming" },
  { id: "news", label: "Notícias" },
  { id: "business", label: "Business" },
  { id: "cinema", label: "Cinema" },
  { id: "retro", label: "Retrô" },
  { id: "3d", label: "3D / Sombra" },
  { id: "neon", label: "Neon" },
  { id: "manuscrito", label: "Manuscrito" },
];

export type CaptionAnimation =
  | "none"
  | "pop"
  | "scale"
  | "bounce"
  | "fade"
  | "slide"
  | "glow"
  | "shake"
  | "typewriter"
  | "wave";

export const CAPTION_ANIMATIONS: { id: CaptionAnimation; label: string }[] = [
  { id: "none", label: "Sem animação" },
  { id: "pop", label: "Pop" },
  { id: "scale", label: "Escala" },
  { id: "bounce", label: "Bounce" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "glow", label: "Glow" },
  { id: "shake", label: "Shake" },
  { id: "typewriter", label: "Máquina de escrever" },
  { id: "wave", label: "Onda" },
];

export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  categories: CaptionCategory[];
  style: CaptionLayerStyle;
  animation: CaptionAnimation;
  /** Fonte web usada pelo preset (carregada no root). */
  font?: string;
  /** Texto curto mostrado no cartão da biblioteca. */
  sampleText?: string;
  /** Posição vertical segura para o formato do preset. */
  positionY?: number;
}

const base: CaptionLayerStyle = {
  fontFamily: "Figtree, sans-serif",
  fontWeight: 800,
  fontSize: 74,
  color: "#ffffff",
  highlight: "color",
  highlightColor: "#7c5cff",
  background: null,
  strokeColor: "#000000",
  strokeWidth: 8,
  shadow: true,
  uppercase: true,
  maxWords: 3,
  maxLines: 2,
  align: "center",
  mode: "karaoke",
};

function preset(
  id: string,
  name: string,
  description: string,
  categories: CaptionCategory[],
  style: Partial<CaptionLayerStyle>,
  animation: CaptionPreset["animation"] = "pop",
  options: Pick<CaptionPreset, "sampleText" | "positionY"> = {},
): CaptionPreset {
  return { id, name, description, categories, style: { ...base, ...style }, animation, ...options };
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  preset("verde-impacto", "Verde Impacto", "Palavra ativa em verde com contorno grosso", ["populares", "impacto", "viral"], {
    highlightColor: "#28f08a",
  }),
  preset("punch-yellow", "Punch Yellow", "Amarelo agressivo, ótimo para hooks", ["populares", "impacto"], {
    highlightColor: "#ffd93d",
    strokeWidth: 10,
    fontSize: 80,
  }, "bounce"),
  preset("rainbow-flow", "Rainbow Flow", "Cores rotativas por palavra", ["viral"], {
    highlightColor: "#ff5da2",
  }, "scale"),
  preset("clean-bold", "Clean Bold", "Branco sólido, leitura fácil", ["populares", "basico"], {
    highlight: "scale",
    strokeWidth: 6,
    uppercase: false,
  }, "scale"),
  preset("minimal-white", "Minimal White", "Discreto, sem contorno", ["minimalista", "basico"], {
    strokeWidth: 0,
    shadow: true,
    fontWeight: 600,
    uppercase: false,
    highlight: "underline",
    highlightColor: "#ffffff",
  }, "fade"),
  preset("subtitle-box", "Subtitle Box", "Caixa escura translúcida", ["basico", "business"], {
    background: "rgba(8,10,20,.72)",
    strokeWidth: 0,
    uppercase: false,
    fontWeight: 600,
    highlight: "box",
    maxWords: 8,
  }, "fade"),
  preset("podcast-bold", "Podcast Bold", "Duas linhas, foco na fala", ["podcast"], {
    maxWords: 5,
    fontSize: 64,
    highlightColor: "#7c5cff",
  }),
  preset("karaoke-pop", "Karaokê Pop", "Palavra a palavra com pulo", ["karaoke", "viral"], {
    mode: "karaoke",
    maxWords: 1,
    fontSize: 92,
    highlightColor: "#00e5ff",
  }, "bounce"),
  preset("color-word", "Color Word", "Só a palavra ativa colorida", ["karaoke", "impacto"], {
    maxWords: 4,
    highlightColor: "#ff4d6d",
  }, "pop"),
  preset("black-stroke", "Black Stroke", "Contorno preto extremo", ["impacto", "gaming"], {
    strokeWidth: 14,
    fontSize: 84,
    highlightColor: "#ffffff",
  }, "shake"),
  preset("neon", "Neon", "Brilho neon nas palavras", ["gaming", "viral"], {
    highlightColor: "#b16bff",
    strokeColor: "#12002e",
    strokeWidth: 6,
  }, "glow"),
  preset("news-caption", "News Caption", "Faixa de notícia", ["news", "business"], {
    background: "rgba(180,20,32,.92)",
    strokeWidth: 0,
    fontWeight: 700,
    maxWords: 7,
    highlight: "box",
  }, "slide"),
  preset("editorial", "Editorial", "Serifado, tom editorial", ["minimalista", "business"], {
    fontFamily: "'Instrument Serif', serif",
    fontWeight: 500,
    uppercase: false,
    strokeWidth: 0,
    fontSize: 70,
    highlight: "color",
    highlightColor: "#ffd93d",
  }, "fade"),
  preset("dynamic-scale", "Dynamic Scale", "A palavra ativa cresce", ["populares", "viral"], {
    highlight: "scale",
    maxWords: 3,
  }, "scale"),

  // ————— Impacto / viral —————
  preset("anton-punch", "Anton Punch", "Anton pesado com contorno preto", ["populares", "impacto", "viral"], {
    fontFamily: "Anton, sans-serif", fontWeight: 400, fontSize: 88, strokeWidth: 12, highlightColor: "#ffd400",
  }, "bounce"),
  preset("anton-green", "Anton Verde", "Palavra ativa verde neon", ["impacto", "viral"], {
    fontFamily: "Anton, sans-serif", fontWeight: 400, fontSize: 86, highlightColor: "#3dff88", strokeWidth: 10,
  }, "pop"),
  preset("bebas-hook", "Bebas Hook", "Condensada para hooks rápidos", ["impacto", "populares"], {
    fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, fontSize: 96, highlightColor: "#ff3b5c", strokeWidth: 8,
  }, "slide"),
  preset("archivo-slam", "Archivo Slam", "Bloco preto ultra pesado", ["impacto", "gaming"], {
    fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 78, strokeWidth: 12, highlightColor: "#00e0ff",
  }, "shake"),
  preset("mono-brutal", "Mono Brutal", "Monoespaçada brutalista", ["impacto", "gaming"], {
    fontFamily: "'Rubik Mono One', monospace", fontWeight: 400, fontSize: 62, strokeWidth: 6, highlightColor: "#ffd400",
  }, "typewriter"),
  preset("oswald-news", "Oswald Notícia", "Condensada estilo manchete", ["news", "impacto"], {
    fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 76, highlightColor: "#ff4747", strokeWidth: 6,
  }, "slide"),
  preset("red-alert", "Red Alert", "Fundo vermelho urgente", ["impacto", "news"], {
    background: "rgba(200,16,32,.92)", strokeWidth: 0, highlight: "box", highlightColor: "#ffffff",
    fontFamily: "Montserrat, sans-serif", fontWeight: 900, maxWords: 5,
  }, "pop"),
  preset("shock-yellow", "Shock Yellow", "Caixa amarela com texto preto", ["viral", "impacto"], {
    background: "rgba(255,214,0,.95)", color: "#0b0b0b", strokeWidth: 0, highlight: "box", highlightColor: "#0b0b0b",
    fontFamily: "Montserrat, sans-serif", fontWeight: 900, maxWords: 4,
  }, "bounce"),
  preset("pop-magenta", "Pop Magenta", "Rosa choque com pulo", ["viral"], {
    highlightColor: "#ff2fb3", fontFamily: "Poppins, sans-serif", fontWeight: 800, strokeWidth: 9,
  }, "bounce"),
  preset("split-two", "Split Two", "Duas palavras grandes", ["viral", "karaoke"], {
    maxWords: 2, fontSize: 100, fontFamily: "Anton, sans-serif", fontWeight: 400, highlightColor: "#7cff5a", strokeWidth: 10,
  }, "scale"),

  // ————— Karaokê —————
  preset("karaoke-fill", "Karaokê Fill", "Preenchimento palavra a palavra", ["karaoke"], {
    mode: "karaoke", maxWords: 3, highlight: "color", highlightColor: "#ffd400",
  }, "pop"),
  preset("karaoke-box", "Karaokê Box", "Caixa acompanha a fala", ["karaoke"], {
    mode: "karaoke", maxWords: 3, highlight: "box", highlightColor: "#7c5cff", strokeWidth: 4,
  }, "slide"),
  preset("karaoke-underline", "Karaokê Sublinhado", "Sublinha a palavra ativa", ["karaoke", "minimalista"], {
    mode: "karaoke", maxWords: 4, highlight: "underline", highlightColor: "#00e5ff", strokeWidth: 0, shadow: true,
  }, "fade"),
  preset("karaoke-wave", "Karaokê Wave", "Palavras em onda", ["karaoke", "viral"], {
    mode: "karaoke", maxWords: 3, highlightColor: "#ff9f1c",
  }, "wave"),
  preset("one-word-giant", "Uma Palavra", "Uma palavra gigante por vez", ["karaoke", "impacto"], {
    mode: "word", maxWords: 1, fontSize: 120, fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, strokeWidth: 10,
  }, "scale"),

  // ————— Minimalista / business —————
  preset("swiss-clean", "Swiss Clean", "Sem contorno, peso médio", ["minimalista", "business"], {
    strokeWidth: 0, shadow: true, uppercase: false, fontWeight: 600, fontSize: 62, highlight: "color", highlightColor: "#c9d4ff",
  }, "fade"),
  preset("caption-bar", "Caption Bar", "Faixa escura discreta", ["minimalista", "basico"], {
    background: "rgba(0,0,0,.55)", strokeWidth: 0, uppercase: false, fontWeight: 500, maxWords: 8, highlight: "color", highlightColor: "#ffffff",
  }, "fade"),
  preset("corporate-navy", "Corporate", "Sóbrio para conteúdo business", ["business"], {
    background: "rgba(10,22,48,.85)", strokeWidth: 0, uppercase: false, fontWeight: 700, highlight: "color", highlightColor: "#66b2ff", maxWords: 7,
  }, "slide"),
  preset("thin-elegant", "Thin Elegant", "Leve e espaçado", ["minimalista"], {
    strokeWidth: 0, fontWeight: 400, uppercase: false, fontSize: 58, highlight: "color", highlightColor: "#ffd8a8", shadow: true,
  }, "fade"),
  preset("mono-subtitle", "Mono Subtitle", "Legenda técnica monoespaçada", ["minimalista", "business"], {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 52, strokeWidth: 0, uppercase: false,
    background: "rgba(8,10,20,.6)", highlight: "color", highlightColor: "#8affc1", maxWords: 8,
  }, "typewriter"),

  // ————— Podcast —————
  preset("podcast-clean", "Podcast Clean", "Duas linhas confortáveis", ["podcast"], {
    maxWords: 6, fontSize: 60, uppercase: false, fontWeight: 700, strokeWidth: 5, highlightColor: "#7c5cff",
  }, "fade"),
  preset("podcast-yellow", "Podcast Amarelo", "Destaque amarelo clássico", ["podcast", "populares"], {
    maxWords: 5, fontSize: 66, highlightColor: "#ffd400", strokeWidth: 8,
  }, "pop"),
  preset("podcast-mint", "Podcast Mint", "Verde-água suave", ["podcast", "minimalista"], {
    maxWords: 6, fontSize: 62, highlightColor: "#5ef2c4", strokeWidth: 6, uppercase: false,
  }, "scale"),
  preset("interview-box", "Entrevista", "Caixa fixa embaixo", ["podcast", "business"], {
    background: "rgba(12,14,24,.8)", strokeWidth: 0, uppercase: false, fontWeight: 600, maxWords: 9, highlight: "color", highlightColor: "#ffd400",
  }, "fade"),

  // ————— Gaming —————
  preset("gamer-slime", "Gamer Slime", "Verde ácido com contorno", ["gaming", "viral"], {
    highlightColor: "#a4ff00", strokeColor: "#08150a", strokeWidth: 12, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400,
  }, "shake"),
  preset("glitch-cyan", "Glitch Cyan", "Ciano com tremida", ["gaming", "neon"], {
    highlightColor: "#00fff0", strokeColor: "#14002b", strokeWidth: 8,
  }, "shake"),
  preset("hud-mono", "HUD Mono", "Interface de jogo", ["gaming"], {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 56, background: "rgba(0,0,0,.6)",
    strokeWidth: 0, highlight: "box", highlightColor: "#a4ff00",
  }, "typewriter"),
  preset("stream-purple", "Stream Purple", "Roxo de live", ["gaming"], {
    highlightColor: "#a06bff", strokeColor: "#150033", strokeWidth: 10,
  }, "glow"),

  // ————— Neon —————
  preset("neon-pink", "Neon Pink", "Rosa com brilho", ["neon", "viral"], {
    color: "#ffe9f7", highlightColor: "#ff3ea5", strokeColor: "#2a0018", strokeWidth: 6, shadow: true,
  }, "glow"),
  preset("neon-blue", "Neon Blue", "Azul elétrico brilhante", ["neon", "gaming"], {
    color: "#e6f9ff", highlightColor: "#31c6ff", strokeColor: "#00182b", strokeWidth: 6,
  }, "glow"),
  preset("neon-lime", "Neon Lime", "Verde limão luminoso", ["neon"], {
    color: "#f2ffe6", highlightColor: "#c2ff4d", strokeColor: "#132000", strokeWidth: 6,
  }, "glow"),
  preset("neon-outline", "Neon Outline", "Só contorno brilhante", ["neon", "minimalista"], {
    color: "rgba(255,255,255,.15)", highlightColor: "#ff5df2", strokeColor: "#ff5df2", strokeWidth: 4, shadow: true,
  }, "glow"),

  // ————— Cinema —————
  preset("cinema-serif", "Cinema Serif", "Serifada de crédito", ["cinema", "minimalista"], {
    fontFamily: "'Playfair Display', serif", fontWeight: 700, uppercase: false, strokeWidth: 0,
    fontSize: 64, highlight: "color", highlightColor: "#e9c46a", shadow: true,
  }, "fade"),
  preset("cinema-letterbox", "Letterbox", "Faixa preta cinematográfica", ["cinema"], {
    background: "rgba(0,0,0,.9)", strokeWidth: 0, uppercase: false, fontWeight: 500, fontSize: 56,
    highlight: "color", highlightColor: "#f4f1de", maxWords: 9,
  }, "fade"),
  preset("cinema-gold", "Cinema Gold", "Dourado sóbrio", ["cinema", "business"], {
    fontFamily: "'Playfair Display', serif", fontWeight: 700, uppercase: true, strokeWidth: 0,
    color: "#f6e7c1", highlight: "color", highlightColor: "#d4a537", shadow: true, fontSize: 66,
  }, "scale"),
  preset("trailer-caps", "Trailer Caps", "Caixa alta espaçada de trailer", ["cinema", "impacto"], {
    fontFamily: "Oswald, sans-serif", fontWeight: 500, fontSize: 70, strokeWidth: 0, shadow: true,
    highlight: "color", highlightColor: "#ffffff", color: "#d9d9d9", maxWords: 4,
  }, "fade"),

  // ————— Retrô —————
  preset("vhs-retro", "VHS Retro", "Cores dos anos 90", ["retro", "viral"], {
    fontFamily: "'Luckiest Guy', cursive", fontWeight: 400, fontSize: 74, color: "#fff3b0",
    highlightColor: "#ff4d6d", strokeColor: "#241023", strokeWidth: 8,
  }, "shake"),
  preset("retro-sunset", "Retro Sunset", "Laranja anos 80", ["retro", "neon"], {
    fontFamily: "Anton, sans-serif", fontWeight: 400, fontSize: 80, color: "#ffd9a0",
    highlightColor: "#ff7a3d", strokeColor: "#2a0d3d", strokeWidth: 8,
  }, "glow"),
  preset("comic-pop", "Comic Pop", "Estilo quadrinhos", ["retro", "viral"], {
    fontFamily: "'Luckiest Guy', cursive", fontWeight: 400, fontSize: 78, highlightColor: "#ffd400",
    strokeColor: "#000000", strokeWidth: 12,
  }, "bounce"),
  preset("typewriter-old", "Typewriter", "Texto batido à máquina", ["retro", "minimalista"], {
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 54, uppercase: false,
    strokeWidth: 0, shadow: true, highlight: "color", highlightColor: "#ffd400", maxWords: 6,
  }, "typewriter"),

  // ————— 3D / sombra dura —————
  preset("hard-shadow", "Hard Shadow", "Sombra dura deslocada", ["3d", "impacto"], {
    fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 78, strokeWidth: 0,
    shadow: true, highlightColor: "#ffd400",
  }, "pop"),
  preset("3d-yellow", "3D Amarelo", "Volume amarelo com base preta", ["3d", "viral"], {
    fontFamily: "Anton, sans-serif", fontWeight: 400, fontSize: 84, color: "#ffd400",
    strokeColor: "#111111", strokeWidth: 14, highlightColor: "#ffffff",
  }, "bounce"),
  preset("3d-blue", "3D Azul", "Volume azul profundo", ["3d", "gaming"], {
    fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 76, color: "#e8f4ff",
    strokeColor: "#0b2a6b", strokeWidth: 14, highlightColor: "#4fa3ff",
  }, "pop"),
  preset("emboss-white", "Emboss", "Relevo branco elegante", ["3d", "minimalista"], {
    fontWeight: 800, fontSize: 70, strokeColor: "#2b2b2b", strokeWidth: 6, shadow: true,
    highlight: "scale", highlightColor: "#ffffff", uppercase: false,
  }, "scale"),

  // ————— Manuscrito —————
  preset("marker-note", "Marcador", "Escrita à mão marcante", ["manuscrito", "viral"], {
    fontFamily: "'Permanent Marker', cursive", fontWeight: 400, fontSize: 72, uppercase: false,
    strokeWidth: 6, highlightColor: "#ffd400",
  }, "wave"),
  preset("marker-pink", "Marcador Rosa", "Manuscrito rosa divertido", ["manuscrito"], {
    fontFamily: "'Permanent Marker', cursive", fontWeight: 400, fontSize: 70, uppercase: false,
    strokeWidth: 6, highlightColor: "#ff5da2",
  }, "bounce"),
  preset("handwrite-soft", "Manuscrito Suave", "Traço leve sem contorno", ["manuscrito", "minimalista"], {
    fontFamily: "'Permanent Marker', cursive", fontWeight: 400, fontSize: 62, uppercase: false,
    strokeWidth: 0, shadow: true, highlight: "underline", highlightColor: "#ffd400",
  }, "fade"),

  // ————— Notícias / básico extra —————
  preset("breaking-bar", "Breaking", "Faixa de plantão", ["news"], {
    background: "rgba(190,12,24,.95)", strokeWidth: 0, fontWeight: 800, maxWords: 8,
    highlight: "box", highlightColor: "#ffffff", fontFamily: "Oswald, sans-serif",
  }, "slide"),
  preset("ticker-dark", "Ticker", "Rodapé escuro informativo", ["news", "business"], {
    background: "rgba(6,10,20,.9)", strokeWidth: 0, fontWeight: 600, uppercase: false, maxWords: 10,
    fontSize: 52, highlight: "color", highlightColor: "#7cc0ff",
  }, "slide"),
  preset("fact-check", "Fact Check", "Verde/vermelho de checagem", ["news", "viral"], {
    background: "rgba(0,0,0,.75)", strokeWidth: 0, fontWeight: 800, highlight: "box", highlightColor: "#2ecc71", maxWords: 6,
  }, "pop"),
  preset("basic-white", "Básico Branco", "Legenda padrão simples", ["basico"], {
    strokeWidth: 6, uppercase: false, fontWeight: 700, fontSize: 60, highlight: "color", highlightColor: "#ffffff",
  }, "fade"),
  preset("basic-black-box", "Caixa Preta", "Fundo preto sólido", ["basico"], {
    background: "rgba(0,0,0,.85)", strokeWidth: 0, uppercase: false, fontWeight: 600, maxWords: 8,
    highlight: "color", highlightColor: "#ffd400",
  }, "fade"),
  preset("bold-orange", "Bold Orange", "Laranja quente", ["populares", "viral"], {
    highlightColor: "#ff8a3d", strokeWidth: 9, fontFamily: "Poppins, sans-serif", fontWeight: 800,
  }, "pop"),
  preset("bold-cyan", "Bold Cyan", "Ciano vibrante", ["populares"], {
    highlightColor: "#22d3ee", strokeWidth: 9, fontFamily: "Poppins, sans-serif", fontWeight: 800,
  }, "scale"),
  preset("bold-violet", "Bold Violet", "Violeta da marca", ["populares", "business"], {
    highlightColor: "#7c5cff", strokeWidth: 9, fontFamily: "Montserrat, sans-serif", fontWeight: 900,
  }, "pop"),
  preset("gradient-word", "Palavra Gradiente", "Destaque rosa-ciano alternado", ["viral", "populares"], {
    highlightColor: "#ff5da2", strokeWidth: 8, fontFamily: "Montserrat, sans-serif", fontWeight: 900,
  }, "wave"),
  preset("tiktok-classic", "TikTok Clássico", "Fundo branco, texto preto", ["viral", "basico"], {
    background: "rgba(255,255,255,.95)", color: "#111111", strokeWidth: 0, uppercase: false,
    fontWeight: 700, maxWords: 6, highlight: "box", highlightColor: "#111111",
  }, "pop"),
  preset("reels-soft", "Reels Soft", "Cantos suaves, leitura fácil", ["viral", "minimalista"], {
    background: "rgba(20,20,28,.7)", strokeWidth: 0, uppercase: false, fontWeight: 700, maxWords: 5,
    highlight: "color", highlightColor: "#ff5da2",
  }, "fade"),
  preset("shorts-punch", "Shorts Punch", "Curto e agressivo", ["shorts", "viral", "impacto"], {
    maxWords: 3, fontSize: 92, fontFamily: "Anton, sans-serif", fontWeight: 400, strokeWidth: 12, highlightColor: "#ff3b5c",
  }, "bounce", { sampleText: "VOCÊ PRECISA VER", positionY: 76 }),

  // ————— Shorts: hooks, tutorial, podcast e reação —————
  preset("shorts-hook-lime", "Hook Limão", "Duas palavras com caixa neon para abrir o vídeo", ["shorts", "viral", "impacto"], {
    mode: "karaoke", maxWords: 2, fontSize: 94, fontFamily: "Anton, sans-serif", fontWeight: 400,
    strokeWidth: 8, highlight: "box", highlightColor: "#c7ff38",
  }, "bounce", { sampleText: "OLHA ISSO", positionY: 74 }),
  preset("shorts-one-word-yellow", "Palavra Gigante", "Uma palavra por vez para frases rápidas", ["shorts", "karaoke", "impacto"], {
    mode: "word", maxWords: 1, fontSize: 122, fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400,
    strokeWidth: 12, highlight: "scale", highlightColor: "#ffd400",
  }, "pop", { sampleText: "SEGREDO", positionY: 70 }),
  preset("shorts-podcast-blue", "Podcast Azul", "Leitura confortável para entrevistas e cortes", ["shorts", "podcast", "populares"], {
    mode: "karaoke", maxWords: 4, fontSize: 68, fontFamily: "Poppins, sans-serif", fontWeight: 800,
    uppercase: false, strokeWidth: 7, highlightColor: "#45c8ff",
  }, "scale", { sampleText: "isso mudou minha visão", positionY: 78 }),
  preset("shorts-story-pink", "Story Rosa", "Ritmo leve para histórias e lifestyle", ["shorts", "viral"], {
    mode: "karaoke", maxWords: 3, fontSize: 76, fontFamily: "Montserrat, sans-serif", fontWeight: 900,
    strokeWidth: 8, highlightColor: "#ff4fa3",
  }, "wave", { sampleText: "VOCÊ NÃO IMAGINA", positionY: 76 }),
  preset("shorts-tutorial-cyan", "Tutorial Ciano", "Destaque sublinhado para passos e explicações", ["shorts", "business", "minimalista"], {
    mode: "karaoke", maxWords: 4, fontSize: 66, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400,
    uppercase: false, strokeWidth: 5, highlight: "underline", highlightColor: "#35e7ff",
  }, "slide", { sampleText: "faça assim em segundos", positionY: 78 }),
  preset("shorts-sale-red", "Oferta Vermelha", "Impacto alto para preço, urgência e CTA", ["shorts", "impacto", "business"], {
    mode: "karaoke", maxWords: 2, fontSize: 94, fontFamily: "Anton, sans-serif", fontWeight: 400,
    strokeWidth: 10, highlight: "box", highlightColor: "#ff3152",
  }, "pop", { sampleText: "ÚLTIMA CHANCE", positionY: 74 }),
  preset("shorts-clean-underline", "Clean Sublinhado", "Legenda discreta para conteúdo premium", ["shorts", "minimalista"], {
    mode: "karaoke", maxWords: 4, fontSize: 64, fontFamily: "Poppins, sans-serif", fontWeight: 700,
    uppercase: false, strokeWidth: 0, shadow: true, highlight: "underline", highlightColor: "#ffffff",
  }, "fade", { sampleText: "uma ideia bem simples", positionY: 79 }),
  preset("shorts-neon-purple", "Neon Roxo", "Brilho pulsante para música e lifestyle", ["shorts", "neon", "viral"], {
    mode: "karaoke", maxWords: 3, fontSize: 78, fontFamily: "Montserrat, sans-serif", fontWeight: 900,
    color: "#f7efff", strokeColor: "#210044", strokeWidth: 7, highlightColor: "#b868ff",
  }, "glow", { sampleText: "ENERGIA LÁ EM CIMA", positionY: 75 }),
  preset("shorts-reaction-orange", "Reação Laranja", "Pulo rápido para comentários e reações", ["shorts", "viral", "impacto"], {
    mode: "karaoke", maxWords: 2, fontSize: 90, fontFamily: "'Luckiest Guy', cursive", fontWeight: 400,
    strokeWidth: 11, highlightColor: "#ff8a2b",
  }, "bounce", { sampleText: "NÃO ACREDITO", positionY: 72 }),
  preset("shorts-gaming-electric", "Gaming Elétrico", "Movimento intenso para clips e highlights", ["shorts", "gaming", "neon"], {
    mode: "karaoke", maxWords: 2, fontSize: 82, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400,
    strokeColor: "#071a2b", strokeWidth: 10, highlightColor: "#00f0ff",
  }, "shake", { sampleText: "JOGADA INSANA", positionY: 73 }),
  preset("shorts-fact-green", "Fato Verde", "Destaque confiável para curiosidades e listas", ["shorts", "news", "viral"], {
    mode: "karaoke", maxWords: 4, fontSize: 70, fontFamily: "Poppins, sans-serif", fontWeight: 900,
    strokeWidth: 8, highlightColor: "#45f28d",
  }, "pop", { sampleText: "VOCÊ SABIA DISSO?", positionY: 77 }),
  preset("shorts-caption-card", "Card de Conversa", "Caixa legível para falas longas em tela pequena", ["shorts", "podcast", "basico"], {
    mode: "karaoke", maxWords: 5, fontSize: 62, fontFamily: "Poppins, sans-serif", fontWeight: 700,
    uppercase: false, background: "rgba(8,10,18,.78)", strokeWidth: 0, highlight: "box", highlightColor: "#7c5cff",
  }, "fade", { sampleText: "o ponto principal é este", positionY: 79 }),
];

export const CAPTION_MODES: { id: CaptionLayerStyle["mode"]; label: string; maxWords: number }[] = [
  { id: "line", label: "Frase inteira", maxWords: 8 },
  { id: "word", label: "Palavra por palavra", maxWords: 1 },
  { id: "karaoke", label: "Karaokê", maxWords: 3 },
  { id: "karaoke", label: "2 palavras", maxWords: 2 },
  { id: "karaoke", label: "3 palavras", maxWords: 3 },
];

export function findCaptionPreset(id: string | null | undefined): CaptionPreset {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0]!;
}

export function filterCaptionPresets(category: CaptionCategory, query: string): CaptionPreset[] {
  const q = query.trim().toLowerCase();
  return CAPTION_PRESETS.filter(
    (p) =>
      (category === "todos" || p.categories.includes(category)) &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
  );
}
