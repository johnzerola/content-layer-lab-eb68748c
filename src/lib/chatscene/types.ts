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
export const CHATSCENE_PROJECT_VERSION = 1;

export type ChatSceneAspect = "9:16" | "1:1" | "16:9";

export type MessageKind = "text" | "image" | "emoji" | "system" | "sticker" | "video" | "voice";

/** Confirmação de entrega mostrada ao lado da hora, como em um app real. */
export type MessageStatus = "sent" | "delivered" | "read";

export type ChatKind = "direct" | "group";

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

/** Fundos prontos, para escolher com um clique. */
export const BACKGROUND_PRESETS: { id: string; label: string; value: ChatSceneBackground }[] = [
  { id: "theme", label: "Do tema", value: { kind: "theme" } },
  { id: "noite", label: "Noite", value: { kind: "gradient", color: "#141428", colorB: "#2b1b4d" } },
  { id: "aurora", label: "Aurora", value: { kind: "gradient", color: "#0d2b3e", colorB: "#1f6f6b" } },
  { id: "pessego", label: "Pêssego", value: { kind: "gradient", color: "#ffd9c0", colorB: "#ff9db0" } },
  { id: "carvao", label: "Carvão", value: { kind: "solid", color: "#111318" } },
  { id: "papel", label: "Papel", value: { kind: "solid", color: "#f3efe6" } },
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
}

/** Estilo de entrada das bolhas. */
export type MessageAnimation = "bubble-pop" | "slide-up" | "fade" | "soft-spring" | "fast-pop";

export const ANIMATION_PRESETS: { id: MessageAnimation; label: string }[] = [
  { id: "soft-spring", label: "Mola suave" },
  { id: "bubble-pop", label: "Estouro" },
  { id: "slide-up", label: "Subindo" },
  { id: "fade", label: "Suave" },
  { id: "fast-pop", label: "Rápido" },
];

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
      x: 0.04,
      width: 0.92,
      y: 0.42,
      height: 0.54,
      radius: 0.05,
      backgroundScale: 1.1,
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

/** Os três layouts principais de criador, mostrados com prévia no estúdio. */
export const CREATOR_LAYOUTS: {
  id: ChatLayoutPreset;
  label: string;
  hint: string;
  value: Omit<ChatSceneLayout, "preset">;
}[] = [
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
  messages: ChatMessage[];
  timing: ChatSceneTiming;
  render: ChatSceneRenderSettings;
  /** conversa entre duas pessoas ou grupo com nome e foto próprios */
  chatKind?: ChatKind;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  /** hora inicial mostrada nas bolhas (HH:MM) */
  startClock?: string;
  /** mostrar os tiques de entregue/lido nas mensagens de quem escreve */
  receipts?: boolean;
  /** fundo da cena */
  background?: ChatSceneBackground;
  /** estilo de entrada das bolhas */
  animation?: MessageAnimation;
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
    animation: init.animation ?? "soft-spring",
    layout: init.layout ?? { ...DEFAULT_LAYOUT },
    sound: init.sound ?? { enabled: false, volume: 0.5 },
    branding: init.branding ?? { ...DEFAULT_BRANDING },
    header: init.header ?? { ...DEFAULT_HEADER },
    voiceMix: init.voiceMix ?? { ...DEFAULT_VOICE_MIX },
    camera: init.camera ?? { ...DEFAULT_CAMERA },
    participants: init.participants ?? [me, other],
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

/** Migração defensiva de documentos salvos em versões anteriores. */
export function normalizeChatSceneProject(raw: Partial<ChatSceneProject> | null | undefined): ChatSceneProject {
  const base = createChatSceneProject();
  if (!raw) return base;
  const participants =
    Array.isArray(raw.participants) && raw.participants.length
      ? raw.participants.map((p) => createParticipant(p))
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
    messages,
    timing: { ...DEFAULT_TIMING, ...(raw.timing ?? {}) },
    render: { ...DEFAULT_RENDER, ...(raw.render ?? {}) },
    background: { ...DEFAULT_BACKGROUND, ...(raw.background ?? {}) },
    animation: raw.animation ?? base.animation ?? "soft-spring",
    layout: { ...DEFAULT_LAYOUT, ...(raw.layout ?? {}) },
    sound: { enabled: false, volume: 0.5, ...(raw.sound ?? {}) },
    branding: { ...DEFAULT_BRANDING, ...(raw.branding ?? {}) },
    header: { ...DEFAULT_HEADER, ...(raw.header ?? {}) },
    voiceMix: { ...DEFAULT_VOICE_MIX, ...(raw.voiceMix ?? {}) },
    camera: { ...DEFAULT_CAMERA, ...(raw.camera ?? {}) },
    themeOverrides: { ...(raw.themeOverrides ?? {}) },
  };
}

/**
 * Conversa de demonstração: grupo com quatro pessoas, para o usuário ver tudo
 * funcionando (cabeçalho de grupo, avatares, "digitando…", rolagem e ritmo).
 */
export function createDemoChatSceneProject(): ChatSceneProject {
  const eu = createParticipant({ name: "Você", isSelf: true, color: "#7c5cff" });
  const ana = createParticipant({ name: "Ana", color: "#ff5c8a" });
  const joao = createParticipant({ name: "João", color: "#22c08a" });
  const vo = createParticipant({ name: "Vô Chico", color: "#f2b705" });
  const line = (p: ChatParticipant, text: string, extra: Partial<ChatMessage> = {}) =>
    createMessage(p.id, { text, ...extra });
  return createChatSceneProject({
    title: "Grupo da Família",
    chatKind: "group",
    groupName: "Grupo da Família",
    participants: [eu, ana, joao, vo],
    messages: [
      createMessage(eu.id, { kind: "system", text: "Ana criou o grupo “Grupo da Família”" }),
      line(ana, "gente, o almoço de domingo vai ser na minha casa"),
      line(joao, "eu levo a sobremesa 🍮"),
      line(vo, "eu levo fome"),
      line(eu, "kkkkk combinado então"),
      line(ana, "só não atrasem como da última vez"),
      line(joao, "isso foi o João de 2019, outra pessoa"),
      line(vo, "meio-dia em ponto. quem chegar depois lava a louça"),
    ],
  });
}
