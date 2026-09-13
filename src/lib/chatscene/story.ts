/**
 * Story Engine — transforma um roteiro de conversa em documento do ChatScene.
 *
 * Funções puras: o mesmo roteiro sempre vira o mesmo projeto. A IA só devolve
 * o roteiro (personagens + falas); a montagem, as vozes, a personalidade de
 * digitação e o ritmo são resolvidos aqui, em cima do `ChatSceneProject`.
 */
import { PERSONALITY_PRESETS, splitByPersonality, type TextingPersonality } from "./personality";
import { profileFromPreset, type VoiceAge, type VoiceEmotion, type VoiceGender, type VoiceProfile } from "./voice";
import {
  createMessage,
  createParticipant,
  DEFAULT_TIMING,
  MAIN_THREAD_ID,
  type ChatMessage,
  type ChatParticipant,
  type ChatSceneProject,
  type ChatSceneThread,
} from "./types";

export type StoryTone = "comedia" | "drama" | "suspense" | "emotivo" | "cotidiano";

export const STORY_TONES: { id: StoryTone; label: string; hint: string }[] = [
  { id: "comedia", label: "Comédia", hint: "Situações absurdas e virada engraçada." },
  { id: "drama", label: "Drama", hint: "Conflito familiar ou de trabalho, com peso." },
  { id: "suspense", label: "Suspense", hint: "Tensão crescente e revelação no fim." },
  { id: "emotivo", label: "Emotivo", hint: "História que aperta o coração." },
  { id: "cotidiano", label: "Cotidiano", hint: "Conversa comum com um detalhe inesperado." },
];

export interface StoryCharacter {
  name: string;
  /** papel na história: chefe, filho, mãe, amigo… */
  role: string;
  isSelf?: boolean | undefined;
  gender?: VoiceGender | undefined;
  age?: VoiceAge | undefined;
}

export interface StoryLine {
  speaker: string;
  text: string;
  /** "card" vira cartão de cena ("Momentos antes"); "system" vira aviso */
  kind?: "text" | "card" | "system" | undefined;
  /** nome da conversa onde a fala acontece (ex.: "Chefe", "Grupo da família") */
  thread?: string | undefined;
  emotion?: VoiceEmotion | undefined;
  /** mensagem já visível antes do vídeo começar */
  initial?: boolean | undefined;
}

export interface StoryScript {
  title: string;
  characters: StoryCharacter[];
  lines: StoryLine[];
}

export interface StoryBrief {
  topic: string;
  tone: StoryTone;
  durationSec: number;
  characters: number;
}

export const DEFAULT_BRIEF: StoryBrief = { topic: "", tone: "comedia", durationSec: 60, characters: 3 };

const PALETTE = ["#7c5cff", "#25d366", "#ff5c8a", "#28c6ff", "#ffb347", "#8bd450", "#ff8a5c", "#9d7bff"];

const key = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Escolhe uma identidade vocal sintética coerente com o papel do personagem. */
export function suggestVoicePresetId(character: StoryCharacter): string {
  const role = key(`${character.role} ${character.name}`);
  const female = character.gender === "feminina";
  if (/chefe|patr|diretor|gerente/.test(role)) return female ? "adult-female-boss" : "principal-boss";
  if (/mãe|mae|mamae/.test(role)) return "mother-warm";
  if (/pai|papai/.test(role)) return "father-warm";
  if (/vó|vo |avo|avó/.test(role)) return female ? "grandmother-warm" : "grandfather-calm";
  if (/professor|escola/.test(role)) return "teacher-calm";
  if (/crian|filh|menin|sobrinh|moleque/.test(role)) return female ? "child-girl-animated" : "child-boy-animated";
  if (/adolesc|teen/.test(role)) return female ? "teen-girl-casual" : "teen-boy-casual";
  if (/amig|colega/.test(role)) return female ? "adult-female-friendly" : "friend-energetic";
  if (/nervos|novato|estagi/.test(role)) return "employee-nervous";
  if (/narrad/.test(role)) return "narrator-dramatic";
  return female ? "adult-female-casual" : "adult-male-casual";
}

/** Escolhe o jeito de escrever a partir do papel do personagem. */
export function suggestPersonalityPresetId(character: StoryCharacter): string {
  const role = key(`${character.role} ${character.name}`);
  if (/chefe|patr|diretor|gerente|professor/.test(role)) return "chefe";
  if (/mãe|mae|pai|papai|mamae/.test(role)) return "mae";
  if (/crian|filh|menin|adolesc|teen|sobrinh|moleque/.test(role)) return "filho";
  if (/vó|avo|avó|idos/.test(role)) return "avo";
  return "neutro";
}

function personalityValue(presetId: string): TextingPersonality {
  return (PERSONALITY_PRESETS.find((p) => p.id === presetId) ?? PERSONALITY_PRESETS[0]!).value;
}

/** Ritmo do documento ajustado à duração pedida: história longa fala mais rápido. */
export function timingForDuration(durationSec: number) {
  const speed = durationSec <= 45 ? 1.2 : durationSec <= 90 ? 1.12 : 1.05;
  return { ...DEFAULT_TIMING, speed, gapMs: 380, senderSwitchMs: 150 };
}

/**
 * Monta o documento final a partir do roteiro. Cria participantes, vozes,
 * personalidades, conversas e mensagens já humanizadas (frases longas viram
 * várias bolhas conforme o jeito de escrever de cada um).
 */
export function storyToProject(base: ChatSceneProject, script: StoryScript): ChatSceneProject {
  const participants: ChatParticipant[] = [];
  const voiceProfiles: VoiceProfile[] = [];
  const byName = new Map<string, ChatParticipant>();

  script.characters.forEach((character, index) => {
    const participant = createParticipant({
      name: character.name.trim() || `Pessoa ${index + 1}`,
      isSelf: character.isSelf ?? index === 0,
      color: PALETTE[index % PALETTE.length]!,
      personalityPresetId: suggestPersonalityPresetId(character),
      personality: personalityValue(suggestPersonalityPresetId(character)),
    });
    const profile = profileFromPreset(suggestVoicePresetId(character), {
      id: `voice_${participant.id}`,
      name: participant.name,
    });
    participant.voiceProfileId = profile.id!;
    participant.voice = profile;
    participants.push(participant);
    voiceProfiles.push(profile);
    byName.set(key(participant.name), participant);
  });

  const fallback = participants[0]!;
  const threads: ChatSceneThread[] = [];
  const threadByName = new Map<string, ChatSceneThread>();
  const ensureThread = (name: string | undefined): string => {
    const clean = (name ?? "").trim();
    if (!clean) {
      if (!threads.length) {
        const main = { id: MAIN_THREAD_ID, name: script.title || "Conversa", kind: "direct" as const };
        threads.push(main);
        threadByName.set(key(main.name), main);
      }
      return threads[0]!.id;
    }
    const found = threadByName.get(key(clean));
    if (found) return found.id;
    const thread: ChatSceneThread = {
      id: threads.length === 0 ? MAIN_THREAD_ID : `t_${threads.length + 1}`,
      name: clean,
      avatarUrl: byName.get(key(clean))?.avatarUrl ?? null,
      kind: /grupo|família|familia|turma/.test(key(clean)) ? "group" : "direct",
    };
    threads.push(thread);
    threadByName.set(key(clean), thread);
    return thread.id;
  };

  const messages: ChatMessage[] = [];
  script.lines.forEach((line, index) => {
    const text = line.text.trim();
    if (!text) return;
    const threadId = ensureThread(line.thread);

    if (line.kind === "card" || line.kind === "system") {
      messages.push(createMessage(fallback.id, { kind: line.kind, text, threadId }));
      return;
    }

    const author = byName.get(key(line.speaker)) ?? fallback;
    const parts = splitByPersonality(text, personalityValue(author.personalityPresetId ?? "neutro"), `${index}`);
    parts.forEach((part) => {
      messages.push(
        createMessage(author.id, {
          text: part,
          threadId,
          initial: line.initial ?? false,
          voiceDirection: line.emotion && line.emotion !== "neutral" ? { emotion: line.emotion } : null,
        }),
      );
    });
  });

  ensureThread(undefined);

  return {
    ...base,
    title: script.title.trim() || base.title,
    participants,
    voiceProfiles,
    threads,
    messages,
  };
}
