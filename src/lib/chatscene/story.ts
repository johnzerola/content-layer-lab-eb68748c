/**
 * Story Engine — transforma um roteiro de conversa em documento do ChatScene.
 *
 * Funções puras: o mesmo roteiro sempre vira o mesmo projeto. A IA só devolve
 * o roteiro (personagens + falas); a montagem, as vozes, a personalidade de
 * digitação e o ritmo são resolvidos aqui, em cima do `ChatSceneProject`.
 */
import { PERSONALITY_PRESETS, splitByPersonality, type TextingPersonality } from "./personality";
import { profileFromPreset, type VoiceAge, type VoiceEmotion, type VoiceGender, type VoiceProfile } from "./voice";
import { normalizeStoryScript, storyNameKey } from "./story-generation";
import { selectionFromTransformPreset } from "./voice-transform";
import {
  DEFAULT_STORY_NARRATIVE_STYLE,
  DEFAULT_STORY_SOURCE_TREATMENT,
  type StoryNarrativeStyle,
  type StorySourceTreatment,
} from "./story-style";
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
  /** Optional for compatibility with previously saved requests. */
  narrativeStyle?: StoryNarrativeStyle;
  /** How much of a pasted reference/transcription may remain in the new story. */
  sourceTreatment?: StorySourceTreatment;
}

export const DEFAULT_BRIEF: StoryBrief = {
  topic: "",
  tone: "comedia",
  durationSec: 60,
  characters: 3,
  narrativeStyle: DEFAULT_STORY_NARRATIVE_STYLE,
  sourceTreatment: DEFAULT_STORY_SOURCE_TREATMENT,
};

const PALETTE = ["#7c5cff", "#25d366", "#ff5c8a", "#28c6ff", "#ffb347", "#8bd450", "#ff8a5c", "#9d7bff"];

const key = storyNameKey;

function characterAge(character: StoryCharacter): VoiceAge {
  if (character.age) return character.age;
  const role = key(character.role);
  if (/adolesc|teen/.test(role)) return "teen";
  if (/crian|menin|moleque/.test(role)) return "juvenil";
  if (/\bavo\b|\bvo\b|idos/.test(role)) return "madura";
  return "adulta";
}

function characterGender(character: StoryCharacter): VoiceGender {
  if (character.gender) return character.gender;
  return /\bmae\b|\bmamae\b|professora|amiga|filha|menina|sobrinha|estagiaria/.test(key(character.role))
    ? "feminina" : "masculina";
}

/** Escolhe uma identidade vocal sintética coerente com o papel do personagem. */
export function suggestVoicePresetId(character: StoryCharacter): string {
  const role = key(character.role);
  const gender = characterGender(character);
  const female = gender === "feminina";
  const age = characterAge(character);
  // Family relationships do not imply age: a daughter or son can be an adult.
  if (age === "juvenil") return gender === "neutra" ? "acting-child-happy" : female ? "child-girl-animated" : "child-boy-animated";
  if (age === "teen") return female ? "teen-girl-casual" : "teen-boy-casual";
  if (age === "madura") return female ? "grandmother-warm" : "grandfather-calm";
  if (/chefe|patr|diretor|gerente/.test(role)) return female ? "adult-female-boss" : "principal-boss";
  if (/\bmae\b|\bmamae\b|\bpai\b|\bpapai\b/.test(role)) return female ? "mother-warm" : "father-warm";
  if (/professor/.test(role)) return female ? "adult-female-serious" : "teacher-calm";
  if (/amig|colega/.test(role)) return female ? "adult-female-friendly" : "friend-energetic";
  if (/nervos|novat|estagi/.test(role)) return female ? "adult-female-casual" : "employee-nervous";
  if (/narrad/.test(role)) return female ? "adult-female-warm" : "narrator-dramatic";
  return female ? "adult-female-casual" : "adult-male-casual";
}

/** Escolhe o jeito de escrever a partir do papel do personagem. */
export function suggestPersonalityPresetId(character: StoryCharacter): string {
  const role = key(character.role);
  const age = characterAge(character);
  if (age === "juvenil" || age === "teen") return "filho";
  if (age === "madura") return "avo";
  if (/chefe|patr|diretor|gerente|professor/.test(role)) return "chefe";
  if (/\bmae\b|\bpai\b|\bpapai\b|\bmamae\b/.test(role)) return "mae";
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
  const validated = normalizeStoryScript(script);
  const participants: ChatParticipant[] = [];
  const voiceProfiles: VoiceProfile[] = [];
  const byName = new Map<string, ChatParticipant>();

  validated.characters.forEach((character, index) => {
    const participant = createParticipant({
      name: character.name,
      isSelf: character.isSelf === true,
      color: PALETTE[index % PALETTE.length]!,
      personalityPresetId: suggestPersonalityPresetId(character),
      personality: personalityValue(suggestPersonalityPresetId(character)),
    });
    const profile: VoiceProfile = { ...profileFromPreset(suggestVoicePresetId(character), {
      id: `voice_${participant.id}`,
      name: `${participant.name} — ${character.role.trim() || "personagem"}`,
      provider: "lovable-ai",
      language: "pt",
      locale: "pt-BR",
    }), ageStyle: characterAge(character), genderStyle: characterGender(character) };
    if (base.timing.audioDriven) {
      // One server-side tempo stage, retaining the synthetic casting's timbre.
      // This is an experimental delivery preset, not a clone of a reference voice.
      const transform = selectionFromTransformPreset("dialogue_fast");
      const pitch = profile.pitch ?? 0;
      if (pitch) {
        transform.config.mode = "SPEED_AND_PITCH";
        transform.config.pitchSemitones = pitch;
        transform.config.preservePitch = false;
      }
      profile.speed = 1;
      profile.pitch = 0;
      profile.transform = transform;
    }
    participant.voiceProfileId = profile.id!;
    participant.voice = profile;
    participants.push(participant);
    voiceProfiles.push(profile);
    byName.set(key(participant.name), participant);
  });

  const fallback = participants[0]!;
  const threads: ChatSceneThread[] = [];
  const threadByName = new Map<string, ChatSceneThread>();
  let activeThreadId = MAIN_THREAD_ID;
  const ensureThread = (name: string | undefined): string => {
    const clean = (name ?? "").trim();
    if (!clean) {
      if (!threads.length) {
        const main = { id: MAIN_THREAD_ID, name: validated.title, kind: participants.length > 2 ? "group" as const : "direct" as const };
        threads.push(main);
        threadByName.set(key(main.name), main);
      }
      return activeThreadId;
    }
    const found = threadByName.get(key(clean));
    if (found) { activeThreadId = found.id; return found.id; }
    const thread: ChatSceneThread = {
      id: threads.length === 0 ? MAIN_THREAD_ID : `t_${threads.length + 1}`,
      name: clean,
      avatarUrl: byName.get(key(clean))?.avatarUrl ?? null,
      kind: /grupo|família|familia|turma/.test(key(clean)) ? "group" : "direct",
    };
    threads.push(thread);
    threadByName.set(key(clean), thread);
    activeThreadId = thread.id;
    return thread.id;
  };

  const messages: ChatMessage[] = [];
  validated.lines.forEach((line, index) => {
    const text = line.text.trim();
    if (!text) return;
    const threadId = ensureThread(line.thread);

    if (line.kind === "card" || line.kind === "system") {
      messages.push(createMessage(fallback.id, { kind: line.kind, text, threadId }));
      return;
    }

    const author = byName.get(key(line.speaker))!;
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

  // A title is not a reliable group classifier (e.g. "Almoço de domingo").
  // Count speakers inside each conversation, not all characters in the story.
  for (const thread of threads) {
    const speakers = new Set(messages.filter((message) => message.threadId === thread.id &&
      message.kind !== "card" && message.kind !== "system").map((message) => message.participantId));
    if (speakers.size > 2) thread.kind = "group";
  }

  return {
    ...base,
    title: validated.title,
    participants,
    voiceProfiles,
    threads,
    messages,
  };
}
