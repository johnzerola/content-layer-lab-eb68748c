/**
 * ConversationTimingEngine — o ritmo humano da conversa.
 *
 * Recebe o documento e devolve, para cada mensagem, quanto tempo dura cada
 * etapa: espera, "digitando…", entrada da bolha, leitura e pausa depois.
 * Função pura e determinística: mesmo documento, mesmo resultado — é o que
 * garante que a prévia e o vídeo exportado batem quadro a quadro.
 */
import { participantOf, threadIdOf, type ChatMessage, type ChatParticipant, type ChatSceneProject } from "./types";
import { personalityOf, stableChance } from "./personality";

/** Jeito de digitar de uma pessoa (ritmo, pausas e variação). */
export interface HumanTypingProfile {
  /** caracteres por segundo em ritmo normal */
  baseCps: number;
  /** variação do ritmo (0 = robótico, 1 = muito irregular) */
  variance: number;
  /** pausa extra por vírgula/ponto-e-vírgula (ms) */
  punctuationPause: number;
  /** pausa extra por fim de frase (ms) */
  sentencePause: number;
  /** chance de errar e corrigir (reservado para o modo teclado) */
  typoProbability: number;
  /** tempo gasto apagando e corrigindo (ms) */
  correctionDelay: number;
  /** quanto o ritmo acelera em rajadas curtas (0–1) */
  burstiness: number;
}

export const DEFAULT_TYPING_PROFILE: HumanTypingProfile = {
  baseCps: 9,
  variance: 0.35,
  punctuationPause: 120,
  sentencePause: 260,
  typoProbability: 0,
  correctionDelay: 450,
  burstiness: 0.3,
};

export interface MessageTiming {
  messageId: string;
  /** espera antes de qualquer coisa acontecer (ms) */
  leadInMs: number;
  /** "digitando…" na tela (ms); 0 quando não há */
  typingMs: number;
  /** entrada animada da bolha (ms) */
  entranceMs: number;
  /** tempo de fala/áudio quando existir (ms) — usado na fase de vozes */
  voiceMs: number;
  /** tempo parado para leitura (ms) */
  readingMs: number;
  /** respiro antes da próxima mensagem (ms) */
  pauseAfterMs: number;
  /** pausa dentro do "digitando…" (hesitação); 0 quando não há */
  typingGapStartMs: number;
  typingGapMs: number;
  /** mensagem do histórico: já visível no começo do vídeo */
  initial: boolean;
  /** marcos absolutos desde o início da cena (ms) */
  typingStartMs: number;
  appearMs: number;
  endMs: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Número estável entre 0 e 1 derivado do id — variação sem aleatoriedade. */
function stableJitter(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Quanto tempo essa pessoa levaria para digitar este texto, em ms. */
export function humanTypingMs(text: string, profile: HumanTypingProfile, seed = ""): number {
  const chars = text.trim().length;
  if (!chars) return 0;
  const cps = Math.max(1, profile.baseCps);
  let ms = (chars / cps) * 1000;
  ms += countMatches(text, /[,;:]/g) * profile.punctuationPause;
  ms += countMatches(text, /[.!?…]/g) * profile.sentencePause;
  // rajadas: textos curtos saem proporcionalmente mais rápido
  ms *= 1 - clamp(profile.burstiness, 0, 1) * clamp(1 - chars / 120, 0, 1) * 0.35;
  // variação estável por mensagem, para não soar mecânico
  const jitter = (stableJitter(seed) - 0.5) * 2 * clamp(profile.variance, 0, 1) * 0.3;
  return Math.max(220, Math.round(ms * (1 + jitter)));
}

/** Perfil de digitação derivado da personalidade do personagem. */
export function typingProfileFor(
  participant: ChatParticipant,
  base: Partial<HumanTypingProfile> = {},
): HumanTypingProfile {
  const p = personalityOf(participant);
  const merged = { ...DEFAULT_TYPING_PROFILE, ...base };
  const pausa = p.punctuationStyle === "nenhuma" ? 0.4 : p.punctuationStyle === "correta" ? 1.2 : 1;
  return {
    ...merged,
    baseCps: Math.max(1, p.typingSpeed),
    punctuationPause: Math.round(merged.punctuationPause * pausa),
    sentencePause: Math.round(merged.sentencePause * pausa),
    burstiness: p.responseStyle === "rapida" ? 0.45 : p.responseStyle === "pensada" ? 0.15 : merged.burstiness,
    variance: Math.min(1, merged.variance + p.hesitationLevel * 0.3),
  };
}

/**
 * Hesitação humana: quando a pessoa hesita, o "digitando…" some por um instante
 * e volta antes da mensagem chegar. Determinístico pelo id da mensagem.
 */
export function typingHesitation(
  message: ChatMessage,
  participant: ChatParticipant,
  typingMs: number,
): { gapStartMs: number; gapMs: number } | null {
  const level = personalityOf(participant).hesitationLevel;
  if (level <= 0.05 || typingMs < 900) return null;
  if (stableChance(`hesita:${message.id}`) > level) return null;
  const gapMs = Math.round(Math.min(900, 260 + level * 700));
  const gapStartMs = Math.round(typingMs * 0.45);
  return { gapStartMs, gapMs };
}

/** Tempo de leitura de uma mensagem já na tela, em ms. */
export function readingMs(message: ChatMessage, project: ChatSceneProject): number {
  const t = project.timing;
  const words = message.text.trim() ? message.text.trim().split(/\s+/).length : 0;
  const base = Math.max(message.text.length * t.msPerChar, words * 220);
  // cartão de cena (“Momentos antes”): fica mais tempo na tela, é um corte
  if (message.kind === "card") return Math.round(clamp(base * 1.15 + 700, 1500, Math.max(t.maxReadMs, 3200)));
  const mediaBonus = message.kind === "text" || message.kind === "system" ? 0 : 900;
  const emphasis = message.emphasis ? 1.18 : 1;
  return Math.round(clamp((base + mediaBonus) * emphasis, t.minReadMs, t.maxReadMs));
}

/** Duração do "digitando…" desta mensagem, em ms (0 = sem indicador). */
export function typingMsOf(message: ChatMessage, project: ChatSceneProject): number {
  if (typeof message.typingMs === "number") return Math.max(0, message.typingMs);
  if (!project.timing.typing) return 0;
  if (message.kind === "system" || message.kind === "card") return 0;
  const author = participantOf(project, message.participantId);
  // quem escreve a história não "digita" na tela: a bolha dele entra direto
  if (author.isSelf) return 0;
  if (project.timing.humanTyping) {
    const profile = typingProfileFor(author, project.timing.typingProfile ?? {});
    const text = message.text || "…";
    return clamp(humanTypingMs(text, profile, message.id), 350, 6000);
  }
  return project.timing.typingMs;
}

/** Duração da animação de entrada da bolha, em ms. */
export function entranceMsOf(project: ChatSceneProject): number {
  switch (project.animation ?? "soft-spring") {
    case "fast-pop":
      return 160;
    case "bubble-pop":
      return 260;
    case "slide-up":
      return 300;
    case "fade":
      return 240;
    default:
      return 340;
  }
}

/** Tabela completa de tempos, mensagem a mensagem. */
export function computeMessageTimings(project: ChatSceneProject): MessageTiming[] {
  const t = project.timing;
  const out: MessageTiming[] = [];
  let cursor = 0;
  let previousAuthor = "";
  let previousThread = "";

  project.messages.forEach((message) => {
    const author = participantOf(project, message.participantId);
    const thread = threadIdOf(project, message);
    // corte para outra conversa: um respiro maior, como quem sai de um chat e abre outro
    const threadSwitched = previousThread !== "" && previousThread !== thread;
    const switched = !threadSwitched && previousAuthor && previousAuthor !== author.id;
    const leadIn =
      Math.max(0, message.delayMs ?? 0) +
      Math.max(0, message.voiceDirection?.pauseBeforeMs ?? 0) +
      (threadSwitched ? Math.max(0, t.threadSwitchMs ?? 820) : 0) +
      (switched ? Math.max(0, t.senderSwitchMs ?? 180) : 0);
    const typing = threadSwitched ? 0 : typingMsOf(message, project);
    const entrance = entranceMsOf(project);
    const reading = readingMs(message, project);
    const voice = Math.max(0, message.voiceMs ?? 0);
    const pauseAfter = Math.max(
      0,
      (message.pauseAfterMs ?? t.gapMs) + Math.max(0, message.voiceDirection?.pauseAfterMs ?? 0),
    );

    const initial = message.initial === true;
    const typingStartMs = initial ? 0 : cursor + leadIn;
    const appearMs = initial ? 0 : typingStartMs + typing;
    const hesitation = initial ? null : typingHesitation(message, author, typing);
    // a leitura só termina depois da fala, quando houver áudio
    const hold = initial ? 0 : Math.max(reading, voice);
    const endMs = initial ? cursor : appearMs + entrance + hold + pauseAfter;

    out.push({
      messageId: message.id,
      leadInMs: initial ? 0 : leadIn,
      typingMs: initial ? 0 : typing,
      typingGapStartMs: hesitation?.gapStartMs ?? 0,
      typingGapMs: hesitation?.gapMs ?? 0,
      initial,
      entranceMs: initial ? 0 : entrance,
      voiceMs: initial ? 0 : voice,
      readingMs: hold,
      pauseAfterMs: initial ? 0 : pauseAfter,
      typingStartMs,
      appearMs,
      endMs,
    });

    cursor = endMs;
    if (initial) return;
    previousAuthor = message.kind === "system" || message.kind === "card" ? "" : author.id;
    previousThread = thread;
  });

  return out;
}

/** Duração total da cena em ms, já com o respiro final. */
export function totalDurationMs(project: ChatSceneProject, timings: MessageTiming[]): number {
  const last = timings[timings.length - 1];
  return (last?.endMs ?? 0) + Math.max(0, project.timing.tailMs);
}
