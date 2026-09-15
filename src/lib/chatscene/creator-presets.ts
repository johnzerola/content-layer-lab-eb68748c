import {
  createChatSceneProject,
  DEFAULT_LAYOUT,
  DEFAULT_MOTION,
  type ChatSceneProject,
} from "./types";
import { storyToProject, type StoryScript } from "./story";
import { appendRedditStory } from "./reddit-story";

export type CreatorFormat = "whatsapp" | "reddit";

/** Presentation only: changing format never deletes a script, cast or uploaded media. */
export function applyCreatorFormat(
  project: ChatSceneProject,
  format: CreatorFormat,
): ChatSceneProject {
  return {
    ...project,
    storyFormat: format,
    themeId: "zap",
    dark: true,
    themeOverrides: {
      ...project.themeOverrides,
      header: "#202d34",
      wallpaper: "#0b141a",
      selfBubble: "#075e54",
      peerBubble: "#202d34",
      selfText: "#f2f7f5",
      peerText: "#f2f7f5",
      headerText: "#f2f7f5",
    },
    layout: {
      ...DEFAULT_LAYOUT,
      ...project.layout,
      preset: "custom",
      x: 0.065,
      y: 0.075,
      width: 0.87,
      height: 0.6,
      radius: 0.022,
      opacity: 1,
      header: true,
      autoHeight: true,
      pagination: "pages",
      backgroundBlur: 0,
      backgroundScale: 1,
      backgroundOffsetY: 0,
    },
    background:
      !project.background || project.background.kind === "theme"
        ? { kind: "gradient", color: "#16363b", colorB: "#070d17" }
        : project.background,
    timing: {
      ...project.timing,
      speed: 1,
      typing: false,
      humanTyping: false,
      typingMs: 0,
      gapMs: 80,
      senderSwitchMs: 0,
      threadSwitchMs: 240,
      tailMs: 700,
    },
    motion: { ...DEFAULT_MOTION, ...project.motion, enter: "fast-pop", enterMs: 80 },
    animation: "fast-pop",
    camera: { ...project.camera, mode: "off", intensity: 0 },
    render: { ...project.render, safeZones: false },
  };
}

const SAMPLE: StoryScript = {
  title: "O pacote da vizinha",
  characters: [
    { name: "Lia", role: "amiga", gender: "feminina", age: "adulta", isSelf: true },
    { name: "Bia", role: "vizinha", gender: "feminina", age: "adulta", isSelf: false },
    { name: "Rui", role: "amigo", gender: "masculina", age: "adulta", isSelf: false },
  ],
  lines: [
    { speaker: "Bia", text: "Por que meu pacote está na sua varanda?", thread: "Bia" },
    { speaker: "Lia", text: "Porque ele começou a miar.", thread: "Bia" },
    { speaker: "Bia", text: "Eu comprei uma luminária!", thread: "Bia", emotion: "surprised" },
    {
      speaker: "Lia",
      text: "Então sua luminária tem bigodes.",
      thread: "Bia",
      emotion: "sarcastic",
    },
    { speaker: "Rui", text: "Alguém viu uma caixa azul na rua?", thread: "Grupo da rua" },
    { speaker: "Lia", text: "A caixa azul está comigo. O gato também.", thread: "Grupo da rua" },
    {
      speaker: "Rui",
      text: "Ele dorme nela. A luminária está com o porteiro.",
      thread: "Grupo da rua",
    },
    {
      speaker: "Bia",
      text: "Ótimo. Vou buscar a luminária e visitar o gato.",
      thread: "Grupo da rua",
    },
    {
      speaker: "Lia",
      text: "Traz pilhas. Ele já apagou no meu sofá.",
      thread: "Grupo da rua",
      emotion: "happy",
    },
  ],
};

/** Original demo, no copied channel script, no fabricated generated audio. */
export function createCreatorExample(
  format: CreatorFormat,
  base = createChatSceneProject(),
): ChatSceneProject {
  if (format === "whatsapp") return applyCreatorFormat(storyToProject(base, SAMPLE), format);
  const empty = { ...base, messages: [], participants: [], voiceProfiles: [], threads: [] };
  return applyCreatorFormat(
    appendRedditStory(empty, {
      title: "A câmera estava desligada. A entrevista, não.",
      author: "relato_original",
      community: "historias",
      sourceUrl: "",
      body: "Cinco minutos antes da entrevista, meu gato derrubou a câmera. Achei que ninguém tinha visto. Continuei falando enquanto tentava encaixar o cabo debaixo da mesa. Quando voltei, a entrevistadora estava sorrindo. O gato tinha apertado o botão e passado a reunião inteira ocupando a tela. Ela perguntou o nome dele antes de perguntar meu nome. Uma semana depois, recebi a proposta. No fim do e-mail estava escrito: pode trazer seu assistente para a próxima reunião.",
    }),
    format,
  );
}
