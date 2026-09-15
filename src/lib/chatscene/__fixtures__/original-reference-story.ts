import { createChatSceneProject, createMessage, createParticipant } from "../types";

/** Original ~35s test story. Durations are synthetic fixtures, not generated/approved voices. */
export function originalReferenceStory() {
  const roles = ["lia", "caio", "rui"];
  const lines = [
    ["lia", "Achei uma chave brilhante perto do observatório!", 2800],
    ["caio", "Ela abre a caixa que encontramos ontem?", 2500],
    ["rui", "Esperem por mim antes de tentar. Aquela caixa guarda uma surpresa para toda a turma, e quero mostrar como ela funciona sem estragar a descoberta.", 5300],
    ["lia", "Tudo bem. Vou mandar uma foto para vocês.", 2600],
    ["lia", "A chave tem o desenho de uma estrela.", 2300],
    ["caio", "Cheguei ao portão. O céu ficou completamente limpo!", 2800],
    ["rui", "Mais tarde, no observatório", 1700],
    ["rui", "A caixa não tem brinquedos. Tem as lentes do nosso primeiro telescópio.", 3900],
    ["lia", "Então a surpresa é olhar para o espaço de verdade?", 3000],
    ["caio", "Sim! E cada um vai desenhar aquilo que conseguir encontrar.", 3000],
    ["lia", "Vou começar pela lua. Quem sabe amanhã encontro um planeta!", 3300],
  ] as const;
  return createChatSceneProject({
    id: "fixture-original-observatory", title: "A chave do observatório",
    participants: roles.map((id) => createParticipant({ id, name: id, isSelf: id === "lia" })),
    messages: lines.map(([id, text, voiceMs], i) => createMessage(id, {
      id: `original-${i}`, text, voiceMs, kind: i === 4 ? "image" : i === 6 ? "card" : "text",
      mediaAspect: i === 4 ? 1.5 : null,
      voiceDirection: { emotion: i === 0 ? "excited" : "neutral", speedMultiplier: 1, energyMultiplier: 1, pauseBeforeMs: 0, pauseAfterMs: 0 },
    })),
  });
}
