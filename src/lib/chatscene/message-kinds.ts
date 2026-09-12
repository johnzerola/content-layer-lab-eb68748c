/**
 * Registro de tipos de mensagem — camada CONTENT.
 *
 * Um único lugar descreve o que cada tipo aceita. A UI monta os controles a
 * partir daqui e o desenho pergunta ao registro em vez de espalhar `if`s. Para
 * acrescentar um tipo novo (enquete, localização, chamada perdida) basta
 * registrar aqui e tratar o desenho.
 */
import type { ChatMessage, MessageKind } from "./types";

export interface MessageKindSpec {
  id: MessageKind;
  label: string;
  /** ajuda curta mostrada no estúdio */
  hint: string;
  /** precisa de um arquivo para existir */
  needsMedia: boolean;
  /** tipos de arquivo aceitos no seletor */
  accept?: string;
  /** o texto vira legenda em vez de conteúdo principal */
  textIsCaption: boolean;
  /** pode citar outra mensagem */
  canReply: boolean;
  /** entra na conversa como aviso central, sem autor */
  isSystem: boolean;
  /** ocupa tempo de fala/escuta em vez de leitura */
  isTimed: boolean;
}

export const MESSAGE_KINDS: MessageKindSpec[] = [
  {
    id: "text",
    label: "Texto",
    hint: "Mensagem escrita.",
    needsMedia: false,
    textIsCaption: false,
    canReply: true,
    isSystem: false,
    isTimed: false,
  },
  {
    id: "emoji",
    label: "Emoji grande",
    hint: "Só emoji, sem bolha pequena.",
    needsMedia: false,
    textIsCaption: false,
    canReply: true,
    isSystem: false,
    isTimed: false,
  },
  {
    id: "image",
    label: "Foto",
    hint: "Foto com legenda opcional.",
    needsMedia: true,
    accept: "image/*",
    textIsCaption: true,
    canReply: true,
    isSystem: false,
    isTimed: false,
  },
  {
    id: "sticker",
    label: "Figurinha / GIF",
    hint: "Figurinha ou GIF animado, sem bolha.",
    needsMedia: true,
    accept: "image/gif,image/webp,image/png,image/apng",
    textIsCaption: false,
    canReply: false,
    isSystem: false,
    isTimed: false,
  },
  {
    id: "video",
    label: "Vídeo / meme",
    hint: "Clipe curto dentro da conversa.",
    needsMedia: true,
    accept: "video/*",
    textIsCaption: true,
    canReply: true,
    isSystem: false,
    isTimed: true,
  },
  {
    id: "voice",
    label: "Recado de voz",
    hint: "Barra de áudio com duração; a voz entra na próxima fase.",
    needsMedia: false,
    accept: "audio/*",
    textIsCaption: true,
    canReply: true,
    isSystem: false,
    isTimed: true,
  },
  {
    id: "system",
    label: "Aviso do app",
    hint: "Texto central, como “Fulano entrou no grupo”.",
    needsMedia: false,
    textIsCaption: false,
    canReply: false,
    isSystem: true,
    isTimed: false,
  },
  {
    id: "card",
    label: "Cartão de cena",
    hint: "Quebra de cena em destaque, como “Momentos antes” ou “Enquanto isso”.",
    needsMedia: false,
    textIsCaption: false,
    canReply: false,
    isSystem: true,
    isTimed: false,
  },
];

const BY_ID = new Map(MESSAGE_KINDS.map((k) => [k.id, k]));

export function messageKind(id: MessageKind | undefined): MessageKindSpec {
  return BY_ID.get(id ?? "text") ?? BY_ID.get("text")!;
}

/** Duração do recado de voz, com um valor razoável quando não foi medido. */
export function voiceSeconds(message: ChatMessage): number {
  if (typeof message.durationSec === "number" && message.durationSec > 0) return message.durationSec;
  if (typeof message.voiceMs === "number" && message.voiceMs > 0) return message.voiceMs / 1000;
  const words = Math.max(1, message.text.trim().split(/\s+/).length);
  return Math.min(120, Math.max(2, Math.round(words / 2.6)));
}

/** Rótulo de duração no formato 0:07. */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Desenho da onda do áudio: sempre igual para a mesma mensagem, para a prévia e
 * o arquivo exportado não divergirem.
 */
export function voiceWave(id: string, bars: number): number[] {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const base = 0.25 + ((seed >>> 8) % 1000) / 1000 * 0.75;
    const shape = Math.sin((i / bars) * Math.PI); // mais alto no meio
    out.push(Math.max(0.18, Math.min(1, base * (0.55 + shape * 0.65))));
  }
  return out;
}
