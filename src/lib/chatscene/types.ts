/**
 * Analogue ChatScene — documento único do projeto.
 *
 * Fonte de verdade de tudo que o usuário criou: participantes, mensagens, tema,
 * tempo e configuração de exportação. Nenhuma tela guarda cópia própria desse
 * estado. Camadas separadas por contrato:
 *
 *   CONTENT  participants/messages   (aqui)
 *   THEME    theme                   (./theme)
 *   TIMING   timing                  (./clock)
 *   RENDER   render                  (./renderer)
 */

import { DEFAULT_VOICE_MIX } from "./voice";
import { DEFAULT_CAMERA } from "./camera";

export const CHATSCENE_PROJECT_MODE = "chatscene";
export const CHATSCENE_PROJECT_VERSION = 2;

export type ChatSceneAspect = "9:16" | "1:1" | "16:9";

export type MessageKind = "text" | "image" | "emoji" | "system" | "sticker" | "video" | "voice" | "card";

/** Confirmação de entrega mostrada ao lado da hora, como em um app real. */
export type MessageStatus = "sent" | "delivered" | "read";

export type ChatKind = "direct" | "group";

/**
 * Conversa (thread) dentro da mesma história: a cena pode começar no chat do
 * Chefe e, mais adiante, cortar para o chat do Pedro. Cada mensagem pertence a
 * uma conversa; a troca vira uma transição na tela, com o topo mudando de nome
 * e foto, exatamente como quando alguém abre outro chat no celular.
 */
export interface ChatSceneThread {
  id: string;
  /** nome mostrado no topo */
  name: string;
  avatarUrl?: string | null;
  /** conversa direta ou grupo */
  kind?: ChatKind;
  /** texto embaixo do nome; vazio usa "online" */
  subtitle?: string | null;
}

/** Conversa padrão de projetos que ainda não usam várias conversas. */
export const MAIN_THREAD_ID = "main";

/**
 * Fundo da cena: o papel de parede do tema, uma cor, um degradê, uma foto ou
 * um vídeo em laço (gameplay, paisagem, textura própria ou licenciada).
 */
export interface ChatSceneBackground {
  kind: "theme" | "solid" | "gradient" | "image" | "video";
  color?: string | null;
  /** segunda cor do degradê */
  colorB?: string | null;
  imageUrl?: string | null;
  /** endereço do vídeo de fundo quando kind === "video" */
  videoUrl?: string | null;
  /** repetir o vídeo do começo quando ele acabar */
  loop?: boolean;
}

/**
 * Marca do criador sobre a cena: um @ e/ou uma logo, sempre do próprio
 * usuário. Fica fora da conversa, nunca dentro das bolhas.
 */
export interface ChatSceneBranding {
  enabled: boolean;
  handle: string;
  logoUrl?: string | null;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  /** tamanho relativo à largura do vídeo (0.02–0.12) */
  size: number;
}

export const DEFAULT_BRANDING: ChatSceneBranding = {
  enabled: false,
  handle: "",
  logoUrl: null,
  position: "bottom-right",
  opacity: 0.85,
  size: 0.05,
};

/** Estilos de cabeçalho do vídeo (topo da conversa). */
export type HeaderStyle = "messenger" | "minimal" | "banner" | "none";

export const HEADER_STYLES: { id: HeaderStyle; label: string; hint: string }[] = [
  { id: "messenger", label: "Conversa", hint: "Como um app de mensagens: foto, nome e ícones." },
  { id: "minimal", label: "Simples", hint: "Só a foto e o nome, sem ícones." },
  { id: "banner", label: "Faixa", hint: "Faixa larga com logo e título grande." },
  { id: "none", label: "Sem topo", hint: "Esconde o cabeçalho." },
];

/** Cabeçalho personalizado do criador (logo, texto e estilo). */
export interface ChatSceneHeader {
  style: HeaderStyle;
  title?: string | null;
  subtitle?: string | null;
  logoUrl?: string | null;
  bgImageUrl?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
}

export const DEFAULT_HEADER: ChatSceneHeader = {
  style: "messenger",
  title: null,
  subtitle: null,
  logoUrl: null,
  bgImageUrl: null,
  bgColor: null,
  textColor: null,
};

export const DEFAULT_BACKGROUND: ChatSceneBackground = { kind: "theme" };

/** Categorias da galeria de fundos. */
export type BackgroundCategory = "gameplay" | "satisfatorio" | "cenario" | "cor";

export const BACKGROUND_CATEGORY_LABELS: Record<BackgroundCategory, string> = {
  gameplay: "Gameplay (livre de direitos)",
  satisfatorio: "Satisfatório",
  cenario: "Cenários",
  cor: "Cores e degradês",
};

/** Fundos prontos, para escolher com um clique. Vídeos gerados por IA = livres de direitos autorais. */
export const BACKGROUND_PRESETS: { id: string; label: string; category: BackgroundCategory; value: ChatSceneBackground }[] = [
  { id: "theme", label: "Do tema", category: "cor", value: { kind: "theme" } },
  { id: "block-parkour", label: "Parkour de Blocos", category: "gameplay", value: { kind: "video", videoUrl: "/__l5e/assets-v1/e8658151-859d-4fde-92b7-ee2a5cb486db/block-parkour.mp4", loop: true } },
  { id: "subway-runner", label: "Corrida no Metrô", category: "gameplay", value: { kind: "video", videoUrl: "/__l5e/assets-v1/e610568a-8c0a-40ed-8f70-bed5b420ec4c/subway-runner.mp4", loop: true } },
  { id: "satisfying-mix", label: "Slime & Areia", category: "satisfatorio", value: { kind: "video", videoUrl: "/__l5e/assets-v1/4a7793cd-3f27-4528-bf75-ebbbbe12fe0b/satisfying-mix.mp4", loop: true } },
  { id: "neon-city", label: "Cidade Neon", category: "cenario", value: { kind: "video", videoUrl: "/chatscene/backgrounds/neon-city.mp4", loop: true } },
  { id: "forest-run", label: "Floresta", category: "cenario", value: { kind: "video", videoUrl: "/chatscene/backgrounds/forest-run.mp4", loop: true } },
  { id: "lava-cave", label: "Caverna Lava", category: "cenario", value: { kind: "video", videoUrl: "/chatscene/backgrounds/lava-cave.mp4", loop: true } },
  { id: "ocean-drift", label: "Oceano", category: "cenario", value: { kind: "video", videoUrl: "/chatscene/backgrounds/ocean-drift.mp4", loop: true } },
  { id: "neon-city-still", label: "Cidade Neon (parada)", category: "cenario", value: { kind: "image", imageUrl: "/chatscene/backgrounds/neon-city-still.jpg" } },
  { id: "forest-run-still", label: "Floresta (parada)", category: "cenario", value: { kind: "image", imageUrl: "/chatscene/backgrounds/forest-run-still.jpg" } },
  { id: "lava-cave-still", label: "Caverna (parada)", category: "cenario", value: { kind: "image", imageUrl: "/chatscene/backgrounds/lava-cave-still.jpg" } },
  { id: "noite", label: "Noite", category: "cor", value: { kind: "gradient", color: "#141428", colorB: "#2b1b4d" } },
  { id: "aurora", label: "Aurora", category: "cor", value: { kind: "gradient", color: "#0d2b3e", colorB: "#1f6f6b" } },
  { id: "pessego", label: "Pêssego", category: "cor", value: { kind: "gradient", color: "#ffd9c0", colorB: "#ff9db0" } },
  { id: "carvao", label: "Carvão", category: "cor", value: { kind: "solid", color: "#111318" } },
  { id: "papel", label: "Papel", category: "cor", value: { kind: "solid", color: "#f3efe6" } },
];

export interface ChatParticipant {
  id: string;
  /** nome exibido no cabeçalho e acima das bolhas em conversa de grupo */
  name: string;
  /** o "eu" da história: bolha alinhada à direita */
  isSelf: boolean;
  /** cor de destaque do nome e do avatar (token hex) */
  color: string;
  /** URL pública do avatar; nunca base64 */
  avatarUrl?: string | null;
  /** voz genérica desta pessoa (elenco de vozes) */
  voice?: import("./voice").VoiceProfile | null;
  /** identidade vocal reutilizável; `voice` continua aceito para projetos antigos */
  voiceProfileId?: string | null;
  /** jeito de escrever desta pessoa (tamanho de frase, emoji, ritmo) */
  personality?: Partial<import("./personality").TextingPersonality> | null;
  /** preset de personalidade escolhido no estúdio */
  personalityPresetId?: string | null;
  /** humor de base, usado como emoção padrão das falas */
  emotionalBaseline?: import("./voice").VoiceEmotion | null;
  /** aparência do balão deste personagem (cor, fonte, negrito/itálico) */
  style?: ParticipantStyle;
  /** emoji que esta pessoa costuma usar ao reagir */
  reactionStyle?: string | null;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  kind: MessageKind;
  /** texto da mensagem, legenda da imagem ou aviso de sistema */
  text: string;
  /** URL pública da imagem quando kind === "image" */
  mediaUrl?: string | null;
  /** proporção da imagem (largura / altura), usada no layout */
  mediaAspect?: number | null;
  /** pausa extra antes desta mensagem, em milissegundos */
  delayMs?: number | null;
  /** tempo de "digitando…" antes desta mensagem; null usa o automático */
  typingMs?: number | null;
  /** respiro depois desta mensagem; null usa a pausa padrão da cena */
  pauseAfterMs?: number | null;
  /** momento de peso na história: leitura um pouco mais longa */
  emphasis?: boolean;
  /** som curto tocado quando a mensagem entra; vazio usa o som automático */
  soundEffect?: "send" | "receive" | "alert" | null;
  /** duração da fala quando houver voz (preenchido na fase de vozes) */
  voiceMs?: number | null;
  /** duração mostrada no áudio/recado de voz, em segundos */
  durationSec?: number | null;
  /** id da mensagem citada: desenha o trecho respondido dentro da bolha */
  replyToId?: string | null;
  /** hora mostrada dentro da bolha; null usa o relógio automático da cena */
  time?: string | null;
  /** emoji de reação preso na base da bolha */
  reaction?: string | null;
  /** emoção e ritmo desta fala, sem trocar a identidade do personagem */
  voiceDirection?: Partial<import("./voice").MessageVoiceDirection> | null;
  /** conversa a que esta mensagem pertence; vazio = conversa principal */
  threadId?: string | null;
  /** mensagem do histórico: já está na tela quando o vídeo começa */
  initial?: boolean;
}

/** Aparência do balão de um personagem, por cima do tema da conversa. */
export interface ParticipantStyle {
  /** cor de fundo do balão (vazio = usa o tema) */
  bubbleColor?: string | null;
  /** cor do texto dentro do balão */
  textColor?: string | null;
  /** fonte do texto (vazio = fonte do tema) */
  fontFamily?: string | null;
  bold?: boolean;
  italic?: boolean;
  /** tamanho do texto: 0.8 = menor, 1.3 = maior */
  fontScale?: number;
}

/** Fontes oferecidas na tela de estilo por personagem. */
export const PARTICIPANT_FONTS: { id: string; label: string }[] = [
  { id: "", label: "Fonte do tema" },
  { id: "Figtree, system-ui, sans-serif", label: "Figtree" },
  { id: "Outfit, system-ui, sans-serif", label: "Outfit" },
  { id: "'JetBrains Mono', monospace", label: "Mono" },
  { id: "Georgia, 'Times New Roman', serif", label: "Serifada" },
];

/** Estilo de entrada das bolhas. */
export type MessageAnimation = "bubble-pop" | "slide-up" | "fade" | "soft-spring" | "fast-pop";

export const ANIMATION_PRESETS: { id: MessageAnimation; label: string }[] = [
  { id: "soft-spring", label: "Mola suave" },
  { id: "bubble-pop", label: "Estouro" },
  { id: "slide-up", label: "Subindo" },
  { id: "fade", label: "Suave" },
  { id: "fast-pop", label: "Rápido" },
];

/** Como a cena inteira sai no fim do vídeo. */
export type SceneExit = "none" | "fade" | "up" | "down" | "zoom";

export const SCENE_EXIT_PRESETS: { id: SceneExit; label: string }[] = [
  { id: "fade", label: "Suave" },
  { id: "up", label: "Subindo" },
  { id: "down", label: "Descendo" },
  { id: "zoom", label: "Zoom" },
  { id: "none", label: "Sem saída" },
];

/**
 * Efeitos de entrada das bolhas e de saída da cena, com duração e intensidade
 * ajustáveis pelas alças da linha do tempo. `enter` é a mesma coisa que
 * `project.animation` (mantido para documentos antigos).
 */
export interface ChatSceneMotion {
  enter: MessageAnimation;
  /** duração da entrada de cada bolha (ms) */
  enterMs: number;
  /** força do deslocamento/escala do efeito (0.2 = discreto, 2 = exagerado) */
  intensity: number;
  exit: SceneExit;
  /** duração da saída da cena, no fim do vídeo (ms) */
  exitMs: number;
}

export const DEFAULT_MOTION: ChatSceneMotion = {
  enter: "soft-spring",
  enterMs: 340,
  intensity: 1,
  exit: "fade",
  exitMs: 700,
};

export const MOTION_LIMITS = {
  enterMs: { min: 80, max: 1200 },
  exitMs: { min: 0, max: 2500 },
  intensity: { min: 0.2, max: 2 },
};

/** Enquadramento da conversa dentro do vídeo. */
export type ChatLayoutPreset =
  | "full-chat"
  | "chat-gameplay"
  | "canal-viral"
  | "creator-split"
  | "phone-centered"
  | "floating-chat"
  | "custom";

export interface ChatSceneLayout {
  preset: ChatLayoutPreset;
  /** posição e tamanho da conversa, em fração da tela (0–1) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** opacidade da conversa sobre o fundo */
  opacity: number;
  /** arredondamento das bordas da conversa, em fração da largura */
  radius: number;
  /** mostrar o cabeçalho da conversa */
  header: boolean;
  /** zoom e deslocamento do fundo */
  backgroundScale: number;
  backgroundOffsetY: number;
  /** desfoque do fundo, em pixels na referência 1080 */
  backgroundBlur: number;
  /**
   * A altura acompanha a conversa: o painel começa pequeno (só o topo e a
   * primeira mensagem) e cresce até o limite de `height`, como nos vídeos de
   * conversa animada sobre gameplay.
   */
  autoHeight?: boolean;
}

import { PERSONALITY_PRESETS } from "./personality";

export const DEFAULT_LAYOUT: ChatSceneLayout = {
  preset: "full-chat",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  opacity: 1,
  radius: 0,
  header: true,
  backgroundScale: 1,
  backgroundOffsetY: 0,
  backgroundBlur: 0,
  autoHeight: false,
};

export const LAYOUT_PRESETS: { id: ChatLayoutPreset; label: string; value: Omit<ChatSceneLayout, "preset"> }[] = [
  {
    id: "full-chat",
    label: "Tela cheia",
    value: { ...DEFAULT_LAYOUT },
  },
  {
    id: "chat-gameplay",
    label: "Chat + Gameplay",
    value: {
      ...DEFAULT_LAYOUT,
      x: 0.04,
      width: 0.92,
      y: 0.04,
      height: 0.5,
      radius: 0.05,
      opacity: 0.97,
      backgroundScale: 1.05,
    },
  },
  {
    id: "canal-viral",
    label: "Conversa sobre gameplay",
    value: {
      ...DEFAULT_LAYOUT,
      x: 0.035,
      width: 0.93,
      y: 0.035,
      height: 0.66,
      radius: 0.03,
      opacity: 1,
      header: true,
      backgroundScale: 1.08,
      autoHeight: true,
    },
  },
  {
    id: "creator-split",
    label: "Creator Split",
    value: {
      ...DEFAULT_LAYOUT,
      x: 0.07,
      width: 0.86,
      y: 0.07,
      height: 0.55,
      radius: 0.045,
      opacity: 0.98,
      backgroundScale: 1,
      autoHeight: true,
    },
  },
  {
    id: "phone-centered",
    label: "Celular no centro",
    value: { ...DEFAULT_LAYOUT, x: 0.1, width: 0.8, y: 0.1, height: 0.8, radius: 0.09, backgroundBlur: 18, backgroundScale: 1.15 },
  },
  {
    id: "floating-chat",
    label: "Conversa flutuante",
    value: {
      ...DEFAULT_LAYOUT,
      x: 0.06,
      width: 0.88,
      y: 0.22,
      height: 0.56,
      radius: 0.06,
      opacity: 0.94,
      header: false,
      backgroundBlur: 8,
    },
  },
];

/** Layouts principais de criador, mostrados com prévia no estúdio. */
export const CREATOR_LAYOUTS: {
  id: ChatLayoutPreset;
  label: string;
  hint: string;
  value: Omit<ChatSceneLayout, "preset">;
  /** ajustes de apresentação aplicados junto com o enquadramento */
  apply?: {
    themeId?: string;
    dark?: boolean;
    animation?: MessageAnimation;
    camera?: { mode: "off" | "smooth" | "cuts"; intensity: number };
  };
}[] = [
  {
    id: "canal-viral",
    label: "Conversa sobre gameplay",
    hint: "Painel de conversa em cima que cresce a cada mensagem, gameplay atrás e cortes de câmera.",
    value: LAYOUT_PRESETS.find((l) => l.id === "canal-viral")!.value,
    apply: {
      themeId: "zap",
      dark: true,
      animation: "bubble-pop",
      camera: { mode: "cuts", intensity: 0.6 },
    },
  },
  {
    id: "chat-gameplay",
    label: "Chat + Gameplay",
    hint: "Conversa em cima, gameplay aparecendo embaixo.",
    value: LAYOUT_PRESETS.find((l) => l.id === "chat-gameplay")!.value,
  },
  {
    id: "full-chat",
    label: "Full Screen Chat",
    hint: "Conversa ocupando a tela toda.",
    value: LAYOUT_PRESETS.find((l) => l.id === "full-chat")!.value,
  },
  {
    id: "creator-split",
    label: "Creator Split",
    hint: "Espaço em cima para o criador, conversa embaixo.",
    value: LAYOUT_PRESETS.find((l) => l.id === "creator-split")!.value,
    apply: {
      themeId: "zap",
      dark: true,
      animation: "soft-spring",
      camera: { mode: "cuts", intensity: 0.45 },
    },
  },
];

export interface ChatSceneTiming {
  /** multiplicador global de velocidade: 0.5 = metade da velocidade */
  speed: number;
  /** pausa base entre mensagens (ms) */
  gapMs: number;
  /** tempo de leitura por caractere (ms) */
  msPerChar: number;
  /** leitura mínima e máxima por mensagem (ms) */
  minReadMs: number;
  maxReadMs: number;
  /** mostrar "digitando…" antes das mensagens de quem não é o "eu" */
  typing: boolean;
  /** duração automática do "digitando…" (ms) */
  typingMs: number;
  /** calcular o "digitando…" pelo texto, como uma pessoa de verdade */
  humanTyping?: boolean;
  /** ajustes finos do jeito de digitar */
  typingProfile?: Partial<import("./timing").HumanTypingProfile>;
  /** respiro extra quando a conversa troca de pessoa (ms) */
  senderSwitchMs?: number;
  /** respiro extra quando a cena corta para outra conversa (ms) */
  threadSwitchMs?: number;
  /** segundos parados no fim, para o laço não cortar a última mensagem */
  tailMs: number;
}


export interface ChatSceneRenderSettings {
  aspect: ChatSceneAspect;
  fps: number;
  /** altura alvo do arquivo exportado; a largura vem da proporção */
  height: number;
  /** mostrar as margens seguras das plataformas na prévia */
  safeZones: boolean;
}

export interface ChatSceneProject {
  id: string;
  version: number;
  title: string;
  themeId: string;
  /** ajustes de cor, fonte e forma por cima do tema escolhido */
  themeOverrides?: import("./theme").ThemeOverrides;
  /** variante do tema */
  dark: boolean;
  participants: ChatParticipant[];
  /** elenco reutilizável do projeto */
  voiceProfiles?: import("./voice").VoiceProfile[];
  messages: ChatMessage[];
  timing: ChatSceneTiming;
  render: ChatSceneRenderSettings;
  /** conversa entre duas pessoas ou grupo com nome e foto próprios */
  chatKind?: ChatKind;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  /** conversas da história; quando há mais de uma, a cena corta entre elas */
  threads?: ChatSceneThread[];
  /** hora inicial mostrada nas bolhas (HH:MM) */
  startClock?: string;
  /** mostrar os tiques de entregue/lido nas mensagens de quem escreve */
  receipts?: boolean;
  /** fundo da cena */
  background?: ChatSceneBackground;
  /** estilo de entrada das bolhas */
  animation?: MessageAnimation;
  /** efeitos de entrada e saída, com duração e intensidade */
  motion?: ChatSceneMotion;
  /** enquadramento da conversa dentro do vídeo */
  layout?: ChatSceneLayout;
  /** sons curtos de envio/recebimento na prévia */
  sound?: { enabled: boolean; volume: number };
  /** marca do criador sobre a cena */
  branding?: ChatSceneBranding;
  /** cabeçalho personalizado do vídeo */
  header?: ChatSceneHeader;
  /** falas, música e mixagem */
  voiceMix?: import("./voice").VoiceMixSettings;
  /** movimento de câmera (meia tela, cortes) */
  camera?: import("./camera").ChatSceneCamera;
}

export const DEFAULT_TIMING: ChatSceneTiming = {
  speed: 1,
  gapMs: 450,
  msPerChar: 42,
  minReadMs: 900,
  maxReadMs: 4200,
  typing: true,
  typingMs: 900,
  humanTyping: true,
  senderSwitchMs: 180,
  threadSwitchMs: 820,
  tailMs: 1400,
};

export const DEFAULT_RENDER: ChatSceneRenderSettings = {
  aspect: "9:16",
  fps: 30,
  height: 1920,
  safeZones: true,
};

export const ASPECT_RATIO: Record<ChatSceneAspect, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
};

/** Dimensões do arquivo exportado, sempre pares (exigência dos codecs). */
export function renderSize(render: ChatSceneRenderSettings): { width: number; height: number } {
  const height = Math.max(2, Math.round(render.height / 2) * 2);
  const width = Math.max(2, Math.round((height * ASPECT_RATIO[render.aspect]) / 2) * 2);
  return { width, height };
}

let seq = 0;
export function chatSceneId(prefix: string): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${seq.toString(36)}`;
}

export function createParticipant(init: Partial<ChatParticipant> = {}): ChatParticipant {
  return {
    id: init.id ?? chatSceneId("p"),
    name: init.name ?? "Participante",
    isSelf: init.isSelf ?? false,
    color: init.color ?? "#7c5cff",
    avatarUrl: init.avatarUrl ?? null,
    voice: init.voice ?? null,
    voiceProfileId: init.voiceProfileId ?? null,
    personality: init.personality ?? null,
    personalityPresetId: init.personalityPresetId ?? null,
    emotionalBaseline: init.emotionalBaseline ?? null,
    ...(init.style ? { style: init.style } : {}),
    reactionStyle: init.reactionStyle ?? null,
  };
}

export function createMessage(participantId: string, init: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: init.id ?? chatSceneId("m"),
    participantId,
    kind: init.kind ?? "text",
    text: init.text ?? "",
    mediaUrl: init.mediaUrl ?? null,
    mediaAspect: init.mediaAspect ?? null,
    delayMs: init.delayMs ?? null,
    typingMs: init.typingMs ?? null,
    pauseAfterMs: init.pauseAfterMs ?? null,
    emphasis: init.emphasis ?? false,
    voiceMs: init.voiceMs ?? null,
    durationSec: init.durationSec ?? null,
    replyToId: init.replyToId ?? null,
    time: init.time ?? null,
    reaction: init.reaction ?? null,
    voiceDirection: init.voiceDirection ?? null,
    threadId: init.threadId ?? null,
    initial: init.initial ?? false,
  };
}

/** Hora mostrada na bolha: a informada pelo usuário ou o relógio da cena. */
export function messageClock(project: ChatSceneProject, index: number, message: ChatMessage): string {
  if (message.time) return message.time;
  const [h, min] = (project.startClock ?? "21:14").split(":");
  const base = (Number(h) || 21) * 60 + (Number(min) || 14) + Math.floor(index / 3);
  const total = ((base % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Projeto novo já com dois participantes e uma conversa de exemplo curta. */
export function createChatSceneProject(init: Partial<ChatSceneProject> = {}): ChatSceneProject {
  const me = createParticipant({ name: "Você", isSelf: true, color: "#7c5cff" });
  const other = createParticipant({ name: "Ana", color: "#ff5c8a" });
  return {
    id: init.id ?? chatSceneId("cs"),
    version: CHATSCENE_PROJECT_VERSION,
    title: init.title ?? "Nova conversa",
    themeId: init.themeId ?? "zap",
    themeOverrides: init.themeOverrides ?? {},
    dark: init.dark ?? false,
    chatKind: init.chatKind ?? "direct",
    groupName: init.groupName ?? null,
    groupAvatarUrl: init.groupAvatarUrl ?? null,
    startClock: init.startClock ?? "21:14",
    receipts: init.receipts ?? true,
    background: init.background ?? { ...DEFAULT_BACKGROUND },
    animation: init.animation ?? init.motion?.enter ?? "soft-spring",
    motion: { ...DEFAULT_MOTION, ...(init.motion ?? {}), enter: init.motion?.enter ?? init.animation ?? DEFAULT_MOTION.enter },
    layout: init.layout ?? { ...DEFAULT_LAYOUT },
    sound: init.sound ?? { enabled: false, volume: 0.5 },
    branding: init.branding ?? { ...DEFAULT_BRANDING },
    header: init.header ?? { ...DEFAULT_HEADER },
    voiceMix: init.voiceMix ?? { ...DEFAULT_VOICE_MIX },
    camera: init.camera ?? { ...DEFAULT_CAMERA },
    participants: init.participants ?? [me, other],
    voiceProfiles: init.voiceProfiles ?? [],
    messages:
      init.messages ??
      [
        createMessage(other.id, { text: "Você não vai acreditar no que aconteceu hoje" }),
        createMessage(me.id, { text: "fala logo" }),
        createMessage(other.id, { text: "lembra daquele vídeo que eu postei ontem?" }),
        createMessage(me.id, { text: "o que tinha 200 views?" }),
        createMessage(other.id, { text: "1,2 milhão agora 😭" }),
      ],
    timing: { ...DEFAULT_TIMING, ...(init.timing ?? {}) },
    render: { ...DEFAULT_RENDER, ...(init.render ?? {}) },
  };
}

export function participantOf(project: ChatSceneProject, id: string): ChatParticipant {
  return (
    project.participants.find((p) => p.id === id) ??
    project.participants[0] ??
    createParticipant({ name: "Participante" })
  );
}

/** Conversas da história. Sempre existe ao menos a conversa principal. */
export function threadsOf(project: ChatSceneProject): ChatSceneThread[] {
  const list = (project.threads ?? []).filter((t) => t && t.id);
  if (list.length) return list;
  const isGroup = (project.chatKind ?? "direct") === "group" || project.participants.length > 2;
  const peer = project.participants.find((p) => !p.isSelf);
  return [
    {
      id: MAIN_THREAD_ID,
      name: isGroup
        ? project.groupName || project.title || "Grupo"
        : peer?.name ?? project.participants[0]?.name ?? "Conversa",
      avatarUrl: (isGroup ? project.groupAvatarUrl : peer?.avatarUrl) ?? null,
      kind: isGroup ? "group" : "direct",
      subtitle: null,
    },
  ];
}

/** Conversa a que a mensagem pertence (com volta segura para a principal). */
export function threadIdOf(project: ChatSceneProject, message: ChatMessage): string {
  const list = threadsOf(project);
  if (message.threadId && list.some((t) => t.id === message.threadId)) return message.threadId;
  return list[0]!.id;
}

export function threadOf(project: ChatSceneProject, id: string): ChatSceneThread {
  const list = threadsOf(project);
  return list.find((t) => t.id === id) ?? list[0]!;
}

/** Cria uma conversa nova para a história. */
export function createThread(init: Partial<ChatSceneThread> = {}): ChatSceneThread {
  return {
    id: init.id ?? chatSceneId("t"),
    name: init.name ?? "Nova conversa",
    avatarUrl: init.avatarUrl ?? null,
    kind: init.kind ?? "direct",
    subtitle: init.subtitle ?? null,
  };
}

/** Migração defensiva de documentos salvos em versões anteriores. */
export function normalizeChatSceneProject(raw: Partial<ChatSceneProject> | null | undefined): ChatSceneProject {
  const base = createChatSceneProject();
  if (!raw) return base;
  const legacyProfiles = (raw.participants ?? [])
    .filter((p) => p.voice && !p.voiceProfileId)
    .map((p) => ({ ...p.voice!, id: `voice_${p.id}` }));
  const voiceProfiles = [...(raw.voiceProfiles ?? []), ...legacyProfiles.filter((v) => !(raw.voiceProfiles ?? []).some((p) => p.id === v.id))];
  const participants =
    Array.isArray(raw.participants) && raw.participants.length
      ? raw.participants.map((p) => createParticipant({ ...p, voiceProfileId: p.voiceProfileId ?? (p.voice ? `voice_${p.id}` : null) }))
      : base.participants;
  const validIds = new Set(participants.map((p) => p.id));
  const fallbackId = participants[0]!.id;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map((m) =>
        createMessage(validIds.has(m.participantId) ? m.participantId : fallbackId, m),
      )
    : [];
  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    version: CHATSCENE_PROJECT_VERSION,
    participants,
    voiceProfiles,
    messages,
    timing: { ...DEFAULT_TIMING, ...(raw.timing ?? {}) },
    render: { ...DEFAULT_RENDER, ...(raw.render ?? {}) },
    background: { ...DEFAULT_BACKGROUND, ...(raw.background ?? {}) },
    animation: raw.motion?.enter ?? raw.animation ?? base.animation ?? "soft-spring",
    motion: {
      ...DEFAULT_MOTION,
      ...(raw.motion ?? {}),
      enter: raw.motion?.enter ?? raw.animation ?? DEFAULT_MOTION.enter,
    },
    layout: { ...DEFAULT_LAYOUT, ...(raw.layout ?? {}) },
    sound: { enabled: false, volume: 0.5, ...(raw.sound ?? {}) },
    branding: { ...DEFAULT_BRANDING, ...(raw.branding ?? {}) },
    header: { ...DEFAULT_HEADER, ...(raw.header ?? {}) },
    voiceMix: { ...DEFAULT_VOICE_MIX, ...(raw.voiceMix ?? {}) },
    camera: { ...DEFAULT_CAMERA, ...(raw.camera ?? {}) },
    themeOverrides: { ...(raw.themeOverrides ?? {}) },
    threads: Array.isArray(raw.threads) ? raw.threads.filter((t) => t && t.id).map((t) => createThread(t)) : [],
  };
}

/**
 * Conversa de demonstração: grupo com quatro pessoas, para o usuário ver tudo
 * funcionando (cabeçalho de grupo, avatares, "digitando…", rolagem e ritmo).
 */
export function createDemoChatSceneProject(): ChatSceneProject {
  const persona = (id: string) => {
    const preset = PERSONALITY_PRESETS.find((x) => x.id === id);
    return { personalityPresetId: preset?.id ?? null, personality: preset?.value ?? null };
  };
  const chefe = createParticipant({ id: "chefe", name: "Chefe", color: "#f2b705", voiceProfileId: "voice_chefe", ...persona("chefe") });
  const pedro = createParticipant({ id: "pedro", name: "Pedro", isSelf: true, color: "#7c5cff", voiceProfileId: "voice_pedro", ...persona("filho") });
  const colega = createParticipant({ id: "colega", name: "Colega", color: "#22c08a", voiceProfileId: "voice_colega", ...persona("neutro") });
  const mae = createParticipant({ id: "mae", name: "Mãe", color: "#ff5c8a", voiceProfileId: "voice_mae", ...persona("mae") });
  const line = (p: ChatParticipant, text: string, extra: Partial<ChatMessage> = {}) =>
    createMessage(p.id, { text, ...extra });
  return createChatSceneProject({
    title: "Primeiro dia no trabalho",
    chatKind: "group",
    groupName: "Equipe — Primeiro dia",
    layout: { ...LAYOUT_PRESETS.find((l) => l.id === "creator-split")!.value, preset: "creator-split" },
    dark: true,
    animation: "soft-spring",
    camera: { ...DEFAULT_CAMERA, mode: "cuts", intensity: 0.45 },
    background: { kind: "video", videoUrl: "/chatscene/backgrounds/neon-city.mp4", loop: true },
    participants: [chefe, pedro, colega, mae],
    // duas conversas na mesma história: a cena corta do trabalho para a família
    threads: [
      { id: "trabalho", name: "Equipe — Primeiro dia", kind: "group", subtitle: "chefe, colega" },
      { id: "familia", name: "Mãe", kind: "direct", subtitle: "online" },
    ],
    voiceProfiles: [
      { ...importVoicePreset("adult-male-boss"), id: "voice_chefe", name: "Chefe — firme e autoritário" },
      { ...importVoicePreset("teen-boy-shy"), id: "voice_pedro", name: "Pedro — jovem e tímido" },
      { ...importVoicePreset("adult-male-casual"), id: "voice_colega", name: "Colega — casual e bem-humorado" },
      { ...importVoicePreset("mother-warm"), id: "voice_mae", name: "Mãe — calorosa e acolhedora" },
    ],
    // ritmo de short: cortes rápidos, como nos canais de conversa animada
    timing: { ...DEFAULT_TIMING, speed: 1.12, gapMs: 380, senderSwitchMs: 140 },
    messages: [
      // histórico: já está na tela quando o vídeo começa
      createMessage(colega.id, { text: "Bom diaaa", threadId: "trabalho", initial: true }),
      createMessage(chefe.id, { kind: "card", text: "Primeiro dia do Pedro", threadId: "trabalho" }),
      createMessage(chefe.id, { kind: "system", text: "Pedro entrou na equipe", threadId: "trabalho" }),
      line(chefe, "Bom dia, Pedro. Preparado para o primeiro dia?", { threadId: "trabalho", voiceDirection: { emotion: "serious" } }),
      line(pedro, "Preparado... eu acho 😅", { threadId: "trabalho", voiceDirection: { emotion: "nervous" } }),
      line(colega, "Relaxa. O café fica à esquerda e o chefe quase nunca morde.", { threadId: "trabalho" }),
      createMessage(colega.id, { kind: "image", text: "Seu lugar já está pronto.", mediaUrl: "/chatscene/backgrounds/office-message.jpg", mediaAspect: 9 / 16, threadId: "trabalho" }),
      line(chefe, "Quase nunca?", { threadId: "trabalho", emphasis: true, voiceDirection: { emotion: "annoyed" } }),
      line(colega, "Foi uma piada, chefe. Uma ótima piada.", { threadId: "trabalho" }),
      createMessage(chefe.id, { kind: "card", text: "Enquanto isso, no chat da mãe", threadId: "familia" }),
      line(mae, "Filho, boa sorte! E não esquece o almoço que deixei na mochila.", { threadId: "familia", voiceDirection: { emotion: "happy" } }),
      line(pedro, "Valeu, mãe. Agora a empresa inteira sabe do meu almoço.", { threadId: "familia" }),
      createMessage(chefe.id, { kind: "card", text: "De volta ao trabalho", threadId: "trabalho" }),
      line(chefe, "Pedro, a reunião começa em cinco minutos.", { threadId: "trabalho", voiceDirection: { emotion: "serious" } }),
      line(pedro, "Só preciso abrir a apresentação que preparei ontem.", { threadId: "trabalho", voiceDirection: { emotion: "nervous" } }),
      line(colega, "Você salvou na pasta da equipe, né?", { threadId: "trabalho", voiceDirection: { emotion: "serious" } }),
      line(pedro, "Pasta da equipe?", { threadId: "trabalho", emphasis: true, voiceDirection: { emotion: "surprised" } }),
      createMessage(chefe.id, { kind: "card", text: "Quatro minutos depois", threadId: "trabalho" }),
      line(mae, "Pedro, achei um arquivo chamado APRESENTAÇÃO FINAL no computador de casa.", { threadId: "familia", voiceDirection: { emotion: "serious" } }),
      line(pedro, "Mãe, manda agora. Por favor!", { threadId: "familia", voiceDirection: { emotion: "nervous" } }),
      line(mae, "Já mandei para o seu e-mail. E coloquei um bilhetinho no almoço.", { threadId: "familia", voiceDirection: { emotion: "happy" } }),
      createMessage(chefe.id, { kind: "card", text: "Na sala de reunião", threadId: "trabalho" }),
      line(chefe, "Essa apresentação ficou excelente, Pedro.", { threadId: "trabalho", voiceDirection: { emotion: "surprised" } }),
      line(colega, "Primeiro dia e já salvou a reunião.", { threadId: "trabalho", voiceDirection: { emotion: "excited" } }),
      line(pedro, "O mérito é da minha mãe... e do almoço na mochila.", { threadId: "trabalho", voiceDirection: { emotion: "happy" } }),
      line(chefe, "Então agradeça a ela. E traga almoço para a equipe amanhã.", { threadId: "trabalho", voiceDirection: { emotion: "sarcastic" } }),
    ],
  });
}

/**
 * Segunda versão do mesmo exemplo: a mesma família e as mesmas falas, mas com
 * outro fundo e outra voz para cada personagem — feita para comparar lado a
 * lado qual combinação soa melhor.
 */
export function createDemoChatSceneProjectB(): ChatSceneProject {
  const base = createDemoChatSceneProject();
  const swap: Record<string, Partial<import("./voice").VoiceProfile>> = {
    voice_chefe: { providerVoiceId: "verse", style: "seria", speed: 1.02, pitch: -0.5, energy: .74 },
    voice_pedro: { providerVoiceId: "alloy", style: "animada", speed: 1.06, pitch: 2.5, energy: .58 },
    voice_colega: { providerVoiceId: "ballad", style: "comedy", speed: 1.0, pitch: .5, energy: .7 },
    voice_mae: { providerVoiceId: "shimmer", style: "calma", speed: .94, pitch: 1.5, energy: .46 },
  };
  return {
    ...base,
    id: chatSceneId("scene"),
    title: "Primeiro dia no trabalho — versão B",
    background: { kind: "video", videoUrl: "/chatscene/backgrounds/forest-run.mp4", loop: true },
    timing: { ...base.timing, speed: 1, gapMs: 520, senderSwitchMs: 220 },
    voiceProfiles: (base.voiceProfiles ?? []).map((v) => ({ ...v, ...(v.id ? swap[v.id] ?? {} : {}) })),
  };
}

function importVoicePreset(id: string): import("./voice").VoiceProfile {
  const defaults: Record<string, Partial<import("./voice").VoiceProfile>> = {
    // ritmo e tom calibrados para soar como conversa brasileira, sem sotaque importado
    "adult-male-boss": { providerVoiceId: "onyx", style: "autoritaria", speed: .96, pitch: -1.5, energy: .66 },
    "teen-boy-shy": { providerVoiceId: "echo", style: "calma", speed: .99, pitch: 1.5, energy: .44 },
    "adult-male-casual": { providerVoiceId: "ash", style: "natural", speed: 1.04, pitch: 0, energy: .62 },
    "mother-warm": { providerVoiceId: "sage", style: "calma", speed: .98, pitch: .5, energy: .52 },
  };
  return { presetId: id, provider: "lovable-ai", language: "pt", locale: "pt-BR", style: "natural", speed: 1, gain: 1, ...defaults[id] };
}
