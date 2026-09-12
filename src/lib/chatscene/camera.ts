/**
 * Câmera da cena — a "direção" do vídeo.
 *
 * Nos vídeos de conversa animada a tela não fica parada: ela alterna entre o
 * plano aberto (a conversa inteira) e um plano fechado em cima da mensagem que
 * acabou de chegar, com cortes secos no meio da fala. Isso é feito aqui, de
 * forma determinística: o mesmo quadro sempre devolve o mesmo enquadramento,
 * então a prévia e o MP4 exportado batem.
 */
import type { ConversationPlan } from "./clock";

export type CameraMode = "off" | "smooth" | "cuts";

export interface ChatSceneCamera {
  mode: CameraMode;
  /** força do movimento (0 = quase parada, 1 = bem marcada) */
  intensity: number;
}

export const DEFAULT_CAMERA: ChatSceneCamera = { mode: "off", intensity: 0.6 };

export const CAMERA_MODES: { id: CameraMode; label: string; hint: string }[] = [
  { id: "off", label: "Parada", hint: "Tela cheia o tempo todo" },
  { id: "smooth", label: "Suave", hint: "Aproxima devagar na fala nova" },
  { id: "cuts", label: "Com cortes", hint: "Alterna meia tela e tela cheia" },
];

export interface CameraShot {
  /** zoom aplicado à cena (1 = tela cheia) */
  scale: number;
  /** ponto da tela que fica no centro, em fração (0–1) */
  focusX: number;
  focusY: number;
}

const WIDE: CameraShot = { scale: 1, focusX: 0.5, focusY: 0.5 };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);

/** Índice da última mensagem que já apareceu neste quadro. */
function activeIndex(plan: ConversationPlan, frame: number): number {
  let index = -1;
  for (let i = 0; i < plan.entries.length; i += 1) {
    if (frame >= plan.entries[i]!.appearFrame) index = i;
    else break;
  }
  return index;
}

/**
 * Enquadramento deste quadro. As mensagens novas entram na parte de baixo da
 * tela, então o plano fechado mira embaixo — é o que dá o efeito de "meia
 * tela" com os balões grandes.
 */
export function cameraAt(
  camera: ChatSceneCamera | undefined,
  plan: ConversationPlan,
  frame: number,
): CameraShot {
  const cam = camera ?? DEFAULT_CAMERA;
  if (cam.mode === "off" || !plan.entries.length) return WIDE;
  const intensity = clamp(cam.intensity, 0, 1);
  if (intensity <= 0.01) return WIDE;

  const index = activeIndex(plan, frame);
  if (index < 0) return WIDE;
  const entry = plan.entries[index]!;
  const next = plan.entries[index + 1]?.appearFrame ?? plan.totalFrames;
  const span = Math.max(1, next - entry.appearFrame);
  const progress = clamp((frame - entry.appearFrame) / span, 0, 1);

  // padrão fixo de planos: dois fechados, um aberto — varia sem virar aleatório
  const close = cam.mode === "cuts" ? index % 3 !== 2 : true;
  const maxZoom = cam.mode === "cuts" ? 1 + 0.55 * intensity : 1 + 0.3 * intensity;
  const focusY = 0.5 + 0.16 * intensity;

  if (!close) {
    // plano aberto com uma respiração lenta, para não parecer imagem congelada
    const drift = 0.02 * intensity * Math.sin(progress * Math.PI);
    return { scale: 1 + drift, focusX: 0.5, focusY: 0.5 };
  }

  if (cam.mode === "cuts") {
    // corte seco: já entra fechado e vai afastando devagar até a próxima fala
    const relax = 0.12 * intensity * easeOut(progress);
    return { scale: maxZoom - relax, focusX: 0.5, focusY };
  }

  // suave: aproxima na entrada da mensagem e segura
  const inFrames = Math.max(1, Math.round(plan.fps * 0.6));
  const p = easeOut((frame - entry.appearFrame) / inFrames);
  return { scale: 1 + (maxZoom - 1) * p, focusX: 0.5, focusY: 0.5 + (focusY - 0.5) * p };
}
