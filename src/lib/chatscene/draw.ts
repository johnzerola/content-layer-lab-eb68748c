/**
 * Desenho da conversa em canvas — camada RENDER.
 *
 * Só lê o documento, o tema e a tabela de tempo. Não muta nada e não conhece
 * React: a mesma função serve para a prévia e para a exportação, o que garante
 * que o arquivo final é idêntico ao que o usuário viu.
 */
import { cameraAt } from "./camera";
import type { ConversationPlan } from "./clock";
import { typingAt } from "./clock";
import { mediaFrameAt, type LoadedMedia } from "./media";
import { durationLabel, voiceSeconds, voiceWave } from "./message-kinds";
import type { ChatTheme } from "./theme";
import {
  DEFAULT_LAYOUT,
  messageClock,
  participantOf,
  type ChatMessage,
  type ChatSceneBackground,
  type ChatSceneProject,
} from "./types";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PaintOptions {
  /** mídias já carregadas (foto, figurinha, vídeo), por URL */
  media?: Map<string, LoadedMedia>;
  /** desenhar as margens seguras por cima (só na prévia) */
  safeZones?: boolean;
}

interface Metrics {
  scale: number;
  pad: number;
  headerH: number;
  bubbleMaxW: number;
  fontSize: number;
  lineH: number;
  gap: number;
  avatar: number;
  metaSize: number;
}

function metricsFor(width: number, height: number): Metrics {
  // referência: 1080x1920. Tudo escala pela menor dimensão relativa para que
  // 1:1 e 16:9 não fiquem com texto gigante.
  const scale = Math.min(width / 1080, height / 1920) * (width >= height ? 1.35 : 1);
  const pad = Math.round(34 * scale);
  return {
    scale,
    pad,
    headerH: Math.round(150 * scale),
    bubbleMaxW: Math.round((width - pad * 2) * 0.8),
    fontSize: Math.round(40 * scale),
    lineH: Math.round(54 * scale),
    gap: Math.round(16 * scale),
    avatar: Math.round(56 * scale),
    metaSize: Math.round(24 * scale),
  };
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Quebra o texto respeitando a largura máxima e as quebras manuais. */
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

interface LaidOutMessage {
  message: ChatMessage;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  isSelf: boolean;
  showName: boolean;
  showAvatar: boolean;
  name: string;
  nameColor: string;
  avatarUrl: string | null;
  /** altura da mídia dentro da bolha (0 quando não há) */
  mediaH: number;
  mediaW: number;
  /** figurinha: sem bolha, fundo transparente */
  bare: boolean;
  clock: string;
  /** citação da mensagem respondida, desenhada no topo da bolha */
  reply?: { name: string; color: string; text: string; height: number } | null;
  /** altura da barra do recado de voz (0 quando não é voz) */
  voiceH?: number;
}

interface Layout {
  items: LaidOutMessage[];
  /** altura total ocupada pela lista */
  contentH: number;
  metrics: Metrics;
}

function emojiOnly(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  if (!stripped) return false;
  // sem \p{} para manter compatibilidade ampla: considera curto e sem letras
  return stripped.length <= 6 && !/[a-z0-9à-ú]/i.test(stripped);
}

const isMedia = (kind: ChatMessage["kind"]) => kind === "image" || kind === "video" || kind === "sticker";

/** Como a mensagem citada aparece quando ela não tem texto. */
function quotedKindLabel(kind: ChatMessage["kind"]): string {
  switch (kind) {
    case "image":
      return "Foto";
    case "video":
      return "Vídeo";
    case "sticker":
      return "Figurinha";
    case "voice":
      return "Mensagem de voz";
    default:
      return "Mensagem";
  }
}

/**
 * Calcula posições de todas as mensagens visíveis. O layout é de cima para
 * baixo; a rolagem é aplicada depois, ao pintar.
 */
export function layoutMessages(
  ctx: Ctx2D,
  project: ChatSceneProject,
  theme: ChatTheme,
  messages: ChatMessage[],
  width: number,
  height: number,
  media?: Map<string, LoadedMedia>,
): Layout {
  const m = metricsFor(width, height);
  const isGroup = (project.chatKind ?? "direct") === "group" || project.participants.length > 2;
  const items: LaidOutMessage[] = [];
  let y = 0;
  let lastAuthor = "";

  messages.forEach((message) => {
    const index = project.messages.indexOf(message);
    const author = participantOf(project, message.participantId);
    const isSelf = author.isSelf;
    const big = message.kind === "emoji" || emojiOnly(message.text);
    const fontSize = big ? m.fontSize * 2.1 : m.fontSize;
    const lineH = big ? m.lineH * 2.1 : m.lineH;
    ctx.font = `${big ? 400 : 500} ${fontSize}px ${theme.fontFamily}`;

    if (message.kind === "system") {
      const lines = wrapText(ctx, message.text, width - m.pad * 4);
      const h = lines.length * lineH * 0.8 + m.gap * 1.6;
      items.push({
        message,
        lines,
        x: m.pad,
        y,
        width: width - m.pad * 2,
        height: h,
        isSelf: false,
        showName: false,
        showAvatar: false,
        name: "",
        nameColor: theme.systemText,
        avatarUrl: null,
        mediaH: 0,
        mediaW: 0,
        bare: true,
        clock: "",
      });
      y += h;
      lastAuthor = "";
      return;
    }

    const padX = Math.round(24 * m.scale);
    const padY = Math.round(18 * m.scale);
    const avatarLane = isGroup && !isSelf ? m.avatar + Math.round(14 * m.scale) : 0;
    const loaded = message.mediaUrl ? media?.get(message.mediaUrl) : undefined;
    const aspect = loaded?.aspect || message.mediaAspect || 1.4;

    // figurinha: solta, sem bolha
    if (message.kind === "sticker") {
      const sw = Math.round((width - m.pad * 2 - avatarLane) * 0.44);
      const sh = Math.round(sw / (aspect || 1));
      const x = isSelf ? width - m.pad - sw : m.pad + avatarLane;
      const showName = isGroup && !isSelf && author.id !== lastAuthor;
      const nameH = showName ? Math.round(m.fontSize * 0.85) : 0;
      items.push({
        message,
        lines: [],
        x,
        y: y + nameH,
        width: sw,
        height: sh + Math.round(m.metaSize * 1.3),
        isSelf,
        showName,
        showAvatar: showName,
        name: author.name,
        nameColor: author.color,
        avatarUrl: author.avatarUrl ?? null,
        mediaH: sh,
        mediaW: sw,
        bare: true,
        clock: messageClock(project, index, message),
      });
      y += nameH + sh + Math.round(m.metaSize * 1.3) + m.gap;
      lastAuthor = author.id;
      return;
    }

    const withMedia = isMedia(message.kind);
    const isVoice = message.kind === "voice";
    const maxTextW = m.bubbleMaxW - padX * 2 - avatarLane;
    const lines = message.text ? wrapText(ctx, message.text, maxTextW) : [];
    const textW = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);

    const mediaW = withMedia ? m.bubbleMaxW - padX * 2 - avatarLane : 0;
    const mediaH = withMedia ? Math.round(mediaW / (aspect || 1.4)) : 0;

    // recado de voz: barra de largura fixa com onda e duração
    const voiceH = isVoice ? Math.round(78 * m.scale) : 0;
    const voiceW = isVoice ? Math.round(m.bubbleMaxW * 0.86) - avatarLane : 0;

    // citação da mensagem respondida
    let reply: LaidOutMessage["reply"] = null;
    if (message.replyToId) {
      const quoted = project.messages.find((q) => q.id === message.replyToId);
      if (quoted) {
        const quotedAuthor = participantOf(project, quoted.participantId);
        ctx.font = `400 ${Math.round(m.fontSize * 0.74)}px ${theme.fontFamily}`;
        const snippet = ellipsize(
          ctx,
          quoted.text || quotedKindLabel(quoted.kind),
          maxTextW - Math.round(20 * m.scale),
        );
        reply = {
          name: quotedAuthor.name,
          color: quotedAuthor.color,
          text: snippet,
          height: Math.round(m.fontSize * 1.85),
        };
      }
      ctx.font = `${big ? 400 : 500} ${fontSize}px ${theme.fontFamily}`;
    }
    const replyH = reply ? reply.height + Math.round(10 * m.scale) : 0;

    const showName = isGroup && !isSelf && author.id !== lastAuthor;
    const nameH = showName ? Math.round(m.fontSize * 0.9) : 0;

    ctx.font = `400 ${m.metaSize}px ${theme.fontFamily}`;
    const metaW = ctx.measureText(`${messageClock(project, index, message)}  `).width + (isSelf ? m.metaSize * 1.6 : 0);
    const metaH = Math.round(m.metaSize * 1.35);

    const bubbleW = Math.min(
      m.bubbleMaxW - avatarLane,
      Math.max(mediaW, voiceW, textW, lines.length ? 0 : metaW) + padX * 2,
    );
    const bubbleH =
      padY * 2 +
      replyH +
      voiceH +
      lines.length * lineH +
      metaH +
      (mediaH ? mediaH + (lines.length ? Math.round(12 * m.scale) : 0) : 0);

    const x = isSelf ? width - m.pad - bubbleW : m.pad + avatarLane;
    const reactionH = message.reaction ? Math.round(m.metaSize * 1.9) : 0;

    items.push({
      message,
      lines,
      x,
      y: y + nameH,
      width: bubbleW,
      height: bubbleH,
      isSelf,
      showName,
      showAvatar: showName,
      name: author.name,
      nameColor: author.color,
      avatarUrl: author.avatarUrl ?? null,
      mediaH,
      mediaW,
      bare: false,
      clock: messageClock(project, index, message),
      reply,
      voiceH,
    });

    y += nameH + bubbleH + reactionH + m.gap;
    lastAuthor = author.id;
  });

  return { items, contentH: y, metrics: m };
}

function drawAvatarCircle(
  ctx: Ctx2D,
  theme: ChatTheme,
  cx: number,
  cy: number,
  size: number,
  color: string,
  label: string,
  image?: CanvasImageSource,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(size * 0.42)}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((label[0] ?? "?").toUpperCase(), cx, cy + size * 0.02);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

/** Papel de parede com um desenho discreto repetido, como nos apps reais. */
function drawWallpaper(
  ctx: Ctx2D,
  theme: ChatTheme,
  width: number,
  height: number,
  m: Metrics,
  background?: ChatSceneBackground,
  media?: Map<string, LoadedMedia>,
  seconds = 0,
) {
  const bg = background ?? { kind: "theme" as const };
  if (bg.kind === "solid" && bg.color) {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (bg.kind === "gradient" && bg.color) {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, bg.color);
    grad.addColorStop(1, bg.colorB || bg.color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const sourceUrl =
    bg.kind === "image" ? bg.imageUrl : bg.kind === "video" ? bg.videoUrl || bg.imageUrl : null;
  if (sourceUrl) {
    const item = media?.get(sourceUrl);
    ctx.fillStyle = theme.wallpaper;
    ctx.fillRect(0, 0, width, height);
    if (item) {
      // vídeo de fundo: o quadro vem do tempo da cena, em laço quando pedido
      const duration = item.animated ? item.frames.length / Math.max(1, item.fps) : 0;
      const t =
        bg.kind === "video" && duration
          ? bg.loop === false
            ? Math.min(seconds, duration - 1 / item.fps)
            : seconds % duration
          : 0;
      const frame = item.animated ? mediaFrameAt(item, t) : item.frames[0]!;
      const scale = Math.max(width / item.width, height / item.height);
      const w = item.width * scale;
      const h = item.height * scale;
      ctx.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h);
    }
    return;
  }
  ctx.fillStyle = theme.wallpaper;
  ctx.fillRect(0, 0, width, height);
  const step = Math.round(150 * m.scale);
  ctx.save();
  ctx.strokeStyle = theme.doodle;
  ctx.fillStyle = theme.doodle;
  ctx.lineWidth = Math.max(1, Math.round(3 * m.scale));
  for (let row = 0, y = m.headerH; y < height + step; row++, y += step) {
    for (let col = 0, x = 0; x < width + step; col++, x += step) {
      const ox = x + ((row % 2) * step) / 2;
      const kind = (row * 3 + col) % 4;
      const r = step * 0.16;
      ctx.beginPath();
      if (kind === 0) {
        ctx.arc(ox, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === 1) {
        ctx.moveTo(ox - r, y + r);
        ctx.lineTo(ox, y - r);
        ctx.lineTo(ox + r, y + r);
        ctx.closePath();
        ctx.stroke();
      } else if (kind === 2) {
        roundRect(ctx, ox - r, y - r * 0.8, r * 2, r * 1.6, r * 0.5);
        ctx.stroke();
      } else {
        ctx.arc(ox, y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawHeader(
  ctx: Ctx2D,
  project: ChatSceneProject,
  theme: ChatTheme,
  width: number,
  m: Metrics,
  media?: Map<string, LoadedMedia>,
) {
  ctx.fillStyle = theme.header;
  ctx.fillRect(0, 0, width, m.headerH);
  ctx.fillStyle = theme.divider;
  ctx.fillRect(0, m.headerH - Math.max(1, Math.round(2 * m.scale)), width, Math.max(1, Math.round(2 * m.scale)));

  const isGroup = (project.chatKind ?? "direct") === "group" || project.participants.length > 2;
  const peers = project.participants.filter((p) => !p.isSelf);
  const title = isGroup
    ? project.groupName || project.title || "Grupo"
    : peers[0]?.name ?? project.participants[0]?.name ?? "Conversa";
  const subtitle = isGroup
    ? peers.map((p) => p.name).join(", ") || "conversa em grupo"
    : "online";

  const cy = m.headerH / 2;
  // seta de voltar
  const arrowX = Math.round(26 * m.scale);
  ctx.strokeStyle = theme.headerText;
  ctx.lineWidth = Math.max(2, Math.round(4 * m.scale));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(arrowX + Math.round(16 * m.scale), cy - Math.round(14 * m.scale));
  ctx.lineTo(arrowX, cy);
  ctx.lineTo(arrowX + Math.round(16 * m.scale), cy + Math.round(14 * m.scale));
  ctx.stroke();

  const size = Math.round(74 * m.scale);
  const cx = arrowX + Math.round(34 * m.scale) + size / 2;
  const avatarUrl = isGroup ? project.groupAvatarUrl : peers[0]?.avatarUrl;
  const avatarImg = avatarUrl ? media?.get(avatarUrl)?.frames[0] : undefined;
  drawAvatarCircle(ctx, theme, cx, cy, size, peers[0]?.color ?? theme.selfBubble, title, avatarImg);

  ctx.textAlign = "left";
  ctx.fillStyle = theme.headerText;
  ctx.font = `600 ${Math.round(36 * m.scale)}px ${theme.fontFamily}`;
  const tx = cx + size / 2 + Math.round(20 * m.scale);
  const maxW = width - tx - Math.round(150 * m.scale);
  ctx.textBaseline = "middle";
  ctx.fillText(ellipsize(ctx, title, maxW), tx, cy - Math.round(14 * m.scale));
  ctx.fillStyle = theme.headerMuted;
  ctx.font = `400 ${Math.round(25 * m.scale)}px ${theme.fontFamily}`;
  ctx.fillText(ellipsize(ctx, subtitle, maxW), tx, cy + Math.round(22 * m.scale));

  // ícones de chamada, como em um app real (formas próprias, sem logotipos)
  ctx.strokeStyle = theme.headerMuted;
  ctx.fillStyle = theme.headerMuted;
  ctx.lineWidth = Math.max(2, Math.round(3.5 * m.scale));
  const iconR = Math.round(17 * m.scale);
  const camX = width - Math.round(112 * m.scale);
  roundRect(ctx, camX - iconR, cy - iconR * 0.7, iconR * 1.7, iconR * 1.4, iconR * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(camX + iconR * 0.8, cy);
  ctx.lineTo(camX + iconR * 1.5, cy - iconR * 0.6);
  ctx.lineTo(camX + iconR * 1.5, cy + iconR * 0.6);
  ctx.closePath();
  ctx.fill();
  const dotX = width - Math.round(36 * m.scale);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(dotX, cy + i * Math.round(14 * m.scale), Math.round(3.4 * m.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textBaseline = "alphabetic";
}

function ellipsize(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Tiques de entregue/lido desenhados à mão, ao lado da hora. */
function drawChecks(ctx: Ctx2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.14);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const offset of [0, size * 0.42]) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + size * 0.26, y + size * 0.28);
    ctx.lineTo(x + offset + size * 0.72, y - size * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTypingBubble(
  ctx: Ctx2D,
  theme: ChatTheme,
  m: Metrics,
  x: number,
  y: number,
  frame: number,
) {
  const w = Math.round(130 * m.scale);
  const h = Math.round(72 * m.scale);
  ctx.fillStyle = theme.peerBubble;
  roundRect(ctx, x, y, w, h, h * theme.radius);
  ctx.fill();
  const r = Math.round(8 * m.scale);
  for (let i = 0; i < 3; i++) {
    const phase = (frame / 6 + i * 0.6) % 3;
    const lift = phase < 1 ? Math.sin(phase * Math.PI) : 0;
    ctx.globalAlpha = 0.45 + lift * 0.55;
    ctx.beginPath();
    ctx.arc(x + w / 2 + (i - 1) * r * 3, y + h / 2 - lift * r, r, 0, Math.PI * 2);
    ctx.fillStyle = theme.peerText;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Transformação de entrada da bolha: transparência, deslocamento e escala. */
export function entranceTransform(
  animation: ChatSceneProject["animation"],
  t: number,
): { alpha: number; dy: number; scale: number } {
  const p = Math.max(0, Math.min(1, t));
  const easeOut = 1 - Math.pow(1 - p, 3);
  switch (animation) {
    case "fade":
      return { alpha: p, dy: 0, scale: 1 };
    case "slide-up":
      return { alpha: easeOut, dy: (1 - easeOut) * 1, scale: 1 };
    case "bubble-pop": {
      const overshoot = 1 + Math.sin(p * Math.PI) * 0.06;
      return { alpha: Math.min(1, p * 1.6), dy: 0, scale: p >= 1 ? 1 : overshoot * (0.86 + easeOut * 0.14) };
    }
    case "fast-pop":
      return { alpha: Math.min(1, p * 2), dy: 0, scale: 0.94 + easeOut * 0.06 };
    default: {
      // soft-spring: sobe um pouco e assenta com leve oscilação
      const spring = 1 - Math.exp(-6 * p) * Math.cos(p * Math.PI * 1.6);
      return { alpha: Math.min(1, p * 1.4), dy: (1 - spring) * 0.6, scale: 0.97 + spring * 0.03 };
    }
  }
}

/** Retângulo ocupado pela conversa dentro do vídeo, a partir do enquadramento. */
export function chatRect(
  layout: ChatSceneProject["layout"],
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number; radius: number; opacity: number; header: boolean } {
  const l = layout ?? DEFAULT_LAYOUT;
  const w = Math.max(80, Math.round(width * clampUnit(l.width, 0.2, 1)));
  const h = Math.max(120, Math.round(height * clampUnit(l.height, 0.2, 1)));
  return {
    x: Math.round(width * clampUnit(l.x, 0, 0.8)),
    y: Math.round(height * clampUnit(l.y, 0, 0.8)),
    w,
    h,
    radius: Math.round(w * clampUnit(l.radius, 0, 0.25)),
    opacity: clampUnit(l.opacity, 0.2, 1),
    header: l.header !== false,
  };
}

function clampUnit(v: number | undefined, lo: number, hi: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : hi;
  return Math.max(lo, Math.min(hi, n));
}

/** Pinta um quadro completo da conversa. */
export function paintFrame(
  ctx: Ctx2D,
  project: ChatSceneProject,
  theme: ChatTheme,
  plan: ConversationPlan,
  frame: number,
  width: number,
  height: number,
  options: PaintOptions = {},
) {
  const media = options.media;
  const rect = chatRect(project.layout, width, height);
  const inset = rect.w < width || rect.h < height;

  // câmera: aproxima na fala nova e alterna com a tela cheia
  const shot = cameraAt(project.camera, plan, frame);
  const moving = Math.abs(shot.scale - 1) > 0.001;
  if (moving) {
    ctx.save();
    const fx = shot.focusX * width;
    const fy = shot.focusY * height;
    ctx.translate(fx, fy);
    ctx.scale(shot.scale, shot.scale);
    ctx.translate(-fx, -fy);
  }

  // fundo do vídeo (atrás da conversa)
  if (inset) {
    const l = project.layout ?? DEFAULT_LAYOUT;
    ctx.save();
    if (l.backgroundBlur > 0 && "filter" in ctx) {
      (ctx as CanvasRenderingContext2D).filter = `blur(${Math.round((l.backgroundBlur * width) / 1080)}px)`;
    }
    const scale = clampUnit(l.backgroundScale, 1, 2);
    const bw = width * scale;
    const bh = height * scale;
    ctx.translate((width - bw) / 2, (height - bh) / 2 + height * clampUnit(l.backgroundOffsetY, -0.3, 0.3));
    drawWallpaper(ctx, theme, bw, bh, metricsFor(bw, bh), project.background, media, frame / plan.fps);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(rect.x, rect.y);
  if (rect.radius > 0) {
    roundRect(ctx, 0, 0, rect.w, rect.h, rect.radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(0, 0, rect.w, rect.h);
    ctx.clip();
  }
  ctx.globalAlpha = rect.opacity;
  paintConversation(ctx, project, theme, plan, frame, rect.w, rect.h, rect.header, options);
  ctx.globalAlpha = 1;
  ctx.restore();

  if (moving) ctx.restore();

  drawBranding(ctx, project, width, height, media);

  if (options.safeZones) {
    drawSafeZones(ctx, width, height);
  }
}

/** Marca do criador (@ e/ou logo) por cima da cena, fora da conversa. */
function drawBranding(
  ctx: Ctx2D,
  project: ChatSceneProject,
  width: number,
  height: number,
  media?: Map<string, LoadedMedia>,
) {
  const b = project.branding;
  if (!b?.enabled) return;
  const handle = (b.handle ?? "").trim();
  const logo = b.logoUrl ? media?.get(b.logoUrl)?.frames[0] : undefined;
  if (!handle && !logo) return;

  const size = Math.round(width * Math.max(0.02, Math.min(0.12, b.size || 0.05)));
  const pad = Math.round(width * 0.045);
  const fontSize = Math.round(size * 0.62);
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, Math.min(1, b.opacity ?? 0.85));
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const textW = handle ? ctx.measureText(handle).width : 0;
  const gap = handle && logo ? Math.round(size * 0.3) : 0;
  const totalW = (logo ? size : 0) + gap + textW;
  const right = (b.position ?? "bottom-right").endsWith("right");
  const bottom = (b.position ?? "bottom-right").startsWith("bottom");
  const x = right ? width - pad - totalW : pad;
  const y = bottom ? height - pad - size : pad;

  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, x, y, size, size);
    ctx.restore();
  }
  if (handle) {
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(handle, x + (logo ? size + gap : 0) + 2, y + size / 2 + 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(handle, x + (logo ? size + gap : 0), y + size / 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

function drawSafeZones(ctx: Ctx2D, width: number, height: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,90,140,0.75)";
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = Math.max(2, Math.round((3 * width) / 1080));
  const top = height * 0.12;
  const bottom = height * 0.82;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(width, top);
  ctx.moveTo(0, bottom);
  ctx.lineTo(width, bottom);
  ctx.stroke();
  ctx.restore();
}

/** Desenha a conversa em si dentro de um retângulo já posicionado. */
function paintConversation(
  ctx: Ctx2D,
  project: ChatSceneProject,
  theme: ChatTheme,
  plan: ConversationPlan,
  frame: number,
  width: number,
  height: number,
  showHeader: boolean,
  options: PaintOptions = {},
) {
  const m = metricsFor(width, height);
  const media = options.media;
  const headerH = showHeader ? m.headerH : 0;

  drawWallpaper(ctx, theme, width, height, m, project.background, media, frame / plan.fps);

  const appeared = project.messages.filter((msg) => frame >= (plan.byId[msg.id]?.appearFrame ?? Infinity));

  const layout = layoutMessages(ctx, project, theme, appeared, width, height, media);
  const typing = typingAt(project, plan, frame);
  const typingH = typing ? Math.round(72 * m.scale) + m.gap : 0;

  // deixa a margem inferior livre para a interface das plataformas
  const areaBottom = height - Math.max(m.pad, Math.round(height * 0.1));
  // ScrollPlanner: a conversa fica ancorada embaixo, mas a rolagem entre uma
  // mensagem e a seguinte é suavizada — e continua determinística, porque só
  // depende do quadro atual.
  const targetNow = areaBottom - (layout.contentH + typingH);
  let offsetY = targetNow;
  const last = appeared[appeared.length - 1];
  const lastEntry = last ? plan.byId[last.id] : undefined;
  if (lastEntry) {
    const scrollFrames = Math.max(1, Math.round(plan.fps * 0.28));
    const p = Math.max(0, Math.min(1, (frame - lastEntry.appearFrame) / scrollFrames));
    if (p < 1) {
      const previous = layoutMessages(ctx, project, theme, appeared.slice(0, -1), width, height, media);
      const targetPrev = areaBottom - (previous.contentH + typingH);
      const ease = 1 - Math.pow(1 - p, 3);
      offsetY = targetPrev + (targetNow - targetPrev) * ease;
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, headerH, width, height - headerH);
  ctx.clip();

  for (const item of layout.items) {
    const entry = plan.byId[item.message.id];
    const age = entry ? frame - entry.appearFrame : 0;
    const t = entry ? age / Math.max(1, entry.entranceFrames) : 1;
    const anim = entranceTransform(project.animation, t);
    const rise = anim.dy * Math.round(34 * m.scale);
    const y = offsetY + item.y + rise;
    const seconds = Math.max(0, age) / plan.fps;
    ctx.globalAlpha = anim.alpha;
    const scale = anim.scale;
    const scaling = Math.abs(scale - 1) > 0.001;
    if (scaling) {
      ctx.save();
      const px = item.isSelf ? item.x + item.width : item.x;
      const py = y + item.height;
      ctx.translate(px, py);
      ctx.scale(scale, scale);
      ctx.translate(-px, -py);
    }




    if (item.message.kind === "system") {
      const label = item.lines.join(" ");
      ctx.font = `500 ${Math.round(26 * m.scale)}px ${theme.fontFamily}`;
      const w = ctx.measureText(label).width + Math.round(40 * m.scale);
      const h = Math.round(48 * m.scale);
      ctx.fillStyle = theme.systemBubble;
      roundRect(ctx, (width - w) / 2, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = theme.systemText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, width / 2, y + h / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      if (scaling) ctx.restore();
      continue;
    }

    const padX = Math.round(24 * m.scale);
    const padY = Math.round(18 * m.scale);
    const loaded = item.message.mediaUrl ? media?.get(item.message.mediaUrl) : undefined;

    if (item.showAvatar) {
      const size = m.avatar;
      const avatarImg = item.avatarUrl ? media?.get(item.avatarUrl)?.frames[0] : undefined;
      drawAvatarCircle(
        ctx,
        theme,
        m.pad + size / 2,
        y + size / 2,
        size,
        item.nameColor,
        item.name,
        avatarImg,
      );
    }

    // figurinha: sem bolha, só o desenho e a hora embaixo
    if (item.bare) {
      const src = loaded ? mediaFrameAt(loaded, seconds) : null;
      if (src) {
        ctx.drawImage(src, item.x, y, item.mediaW, item.mediaH);
      } else {
        ctx.fillStyle = theme.systemBubble;
        roundRect(ctx, item.x, y, item.mediaW, item.mediaH, Math.round(24 * m.scale));
        ctx.fill();
      }
      ctx.fillStyle = theme.meta;
      ctx.font = `400 ${m.metaSize}px ${theme.fontFamily}`;
      const label = item.clock;
      const lx = item.isSelf ? item.x + item.mediaW - ctx.measureText(label).width : item.x;
      ctx.fillText(label, lx, y + item.mediaH + m.metaSize);
      if (scaling) ctx.restore();
      continue;
    }

    if (item.showName) {
      ctx.fillStyle = item.nameColor;
      ctx.font = `600 ${Math.round(m.fontSize * 0.68)}px ${theme.fontFamily}`;
      ctx.fillText(item.name, item.x + Math.round(8 * m.scale), y - Math.round(8 * m.scale));
    }

    // bolha com rabinho apontando para o autor
    ctx.fillStyle = item.isSelf ? theme.selfBubble : theme.peerBubble;
    const radius = Math.min(item.height, Math.round(70 * m.scale)) * theme.radius * 1.6;
    roundRect(ctx, item.x, y, item.width, item.height, radius);
    ctx.fill();
    if (theme.tail) {
      const tw = Math.round(16 * m.scale);
      ctx.beginPath();
      if (item.isSelf) {
        ctx.moveTo(item.x + item.width - tw * 0.2, y);
        ctx.lineTo(item.x + item.width + tw, y);
        ctx.lineTo(item.x + item.width - tw * 0.2, y + tw * 1.5);
      } else {
        ctx.moveTo(item.x + tw * 0.2, y);
        ctx.lineTo(item.x - tw, y);
        ctx.lineTo(item.x + tw * 0.2, y + tw * 1.5);
      }
      ctx.closePath();
      ctx.fill();
    }

    let cursorY = y + padY;

    // trecho respondido, com a barrinha colorida do autor citado
    if (item.reply) {
      const rw = item.width - padX * 2;
      const rh = item.reply.height;
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.92;
      ctx.fillStyle = item.isSelf ? theme.peerBubble : theme.systemBubble;
      roundRect(ctx, item.x + padX, cursorY, rw, rh, Math.round(10 * m.scale));
      ctx.fill();
      ctx.fillStyle = item.reply.color;
      ctx.fillRect(item.x + padX, cursorY, Math.round(6 * m.scale), rh);
      ctx.font = `600 ${Math.round(m.fontSize * 0.62)}px ${theme.fontFamily}`;
      ctx.fillText(item.reply.name, item.x + padX + Math.round(18 * m.scale), cursorY + rh * 0.42);
      ctx.font = `400 ${Math.round(m.fontSize * 0.62)}px ${theme.fontFamily}`;
      ctx.fillStyle = theme.meta;
      ctx.fillText(item.reply.text, item.x + padX + Math.round(18 * m.scale), cursorY + rh * 0.85);
      ctx.restore();
      cursorY += rh + Math.round(10 * m.scale);
    }

    // recado de voz: play, onda e duração
    if (item.voiceH) {
      const vh = item.voiceH;
      const vw = item.width - padX * 2;
      const r = Math.round(vh * 0.36);
      const cx = item.x + padX + r;
      const cy = cursorY + vh / 2;
      ctx.fillStyle = item.isSelf ? theme.selfText : theme.peerText;
      ctx.globalAlpha = ctx.globalAlpha * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.lineTo(cx - r * 0.3, cy + r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = anim.alpha;

      const seconds = voiceSeconds(item.message);
      const label = durationLabel(seconds);
      ctx.font = `400 ${m.metaSize}px ${theme.fontFamily}`;
      const labelW = ctx.measureText(label).width + Math.round(12 * m.scale);
      const waveX = cx + r + Math.round(16 * m.scale);
      const waveW = Math.max(Math.round(40 * m.scale), item.x + padX + vw - labelW - waveX);
      const bars = Math.max(10, Math.min(34, Math.round(waveW / Math.max(6, 10 * m.scale))));
      const wave = voiceWave(item.message.id, bars);
      const barW = Math.max(2, Math.round(waveW / (bars * 1.9)));
      const played = Math.max(0, Math.min(1, (age / plan.fps) / Math.max(0.5, seconds)));
      for (let i = 0; i < bars; i += 1) {
        const bh = Math.max(barW, wave[i]! * vh * 0.52);
        const bx = waveX + i * (waveW / bars);
        ctx.fillStyle = i / bars <= played ? theme.check : item.isSelf ? theme.metaSelf : theme.meta;
        roundRect(ctx, bx, cy - bh / 2, barW, bh, barW / 2);
        ctx.fill();
      }
      ctx.fillStyle = item.isSelf ? theme.metaSelf : theme.meta;
      ctx.fillText(label, item.x + padX + vw - labelW + Math.round(6 * m.scale), cy + m.metaSize * 0.35);
      cursorY += vh;
    }

    if (item.mediaH) {
      const mw = item.width - padX * 2;
      const mh = Math.round(mw / (loaded?.aspect || item.message.mediaAspect || 1.4));
      const src = loaded ? mediaFrameAt(loaded, seconds) : null;
      ctx.save();
      roundRect(ctx, item.x + padX, cursorY, mw, mh, Math.round(16 * m.scale));
      ctx.clip();
      if (src) {
        ctx.drawImage(src, item.x + padX, cursorY, mw, mh);
      } else {
        ctx.fillStyle = theme.divider;
        ctx.fillRect(item.x + padX, cursorY, mw, mh);
      }
      ctx.restore();
      if (item.message.kind === "video" && !loaded?.animated) {
        // vídeo ainda não carregado: marca de reprodução no centro
        const r = Math.round(44 * m.scale);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.arc(item.x + padX + mw / 2, cursorY + mh / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(item.x + padX + mw / 2 - r * 0.25, cursorY + mh / 2 - r * 0.4);
        ctx.lineTo(item.x + padX + mw / 2 + r * 0.45, cursorY + mh / 2);
        ctx.lineTo(item.x + padX + mw / 2 - r * 0.25, cursorY + mh / 2 + r * 0.4);
        ctx.closePath();
        ctx.fill();
      }
      cursorY += mh + (item.lines.length ? Math.round(12 * m.scale) : 0);
    }

    const big = item.message.kind === "emoji" || emojiOnly(item.message.text);
    const fontSize = big ? m.fontSize * 2.1 : m.fontSize;
    const lineH = big ? m.lineH * 2.1 : m.lineH;
    ctx.font = `${big ? 400 : 500} ${fontSize}px ${theme.fontFamily}`;
    ctx.fillStyle = item.isSelf ? theme.selfText : theme.peerText;
    item.lines.forEach((line, i) => {
      ctx.fillText(line, item.x + padX, cursorY + (i + 1) * lineH - lineH * 0.3);
    });

    // hora e confirmação de leitura, no canto inferior direito da bolha
    ctx.font = `400 ${m.metaSize}px ${theme.fontFamily}`;
    ctx.fillStyle = item.isSelf ? theme.metaSelf : theme.meta;
    const showChecks = item.isSelf && (project.receipts ?? true);
    const checkW = showChecks ? m.metaSize * 1.7 : 0;
    const clockW = ctx.measureText(item.clock).width;
    const metaX = item.x + item.width - padX - clockW - checkW;
    const metaY = y + item.height - padY * 0.6;
    ctx.fillText(item.clock, metaX, metaY);
    if (showChecks) {
      drawChecks(
        ctx,
        metaX + clockW + m.metaSize * 0.4,
        metaY - m.metaSize * 0.35,
        m.metaSize,
        theme.check,
      );
    }

    if (item.message.reaction) {
      const rSize = Math.round(m.metaSize * 1.7);
      const rx = item.isSelf ? item.x + item.width - rSize * 1.8 : item.x + Math.round(14 * m.scale);
      const ry = y + item.height - rSize * 0.35;
      ctx.fillStyle = theme.peerBubble;
      roundRect(ctx, rx, ry, rSize * 1.6, rSize, rSize / 2);
      ctx.fill();
      ctx.font = `400 ${Math.round(rSize * 0.72)}px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.peerText;
      ctx.fillText(item.message.reaction, rx + rSize * 0.8, ry + rSize / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    if (scaling) ctx.restore();
  }

  ctx.globalAlpha = 1;

  if (typing) {
    const author = participantOf(project, typing.participantId);
    const isGroup = (project.chatKind ?? "direct") === "group" || project.participants.length > 2;
    const lane = isGroup && !author.isSelf ? m.avatar + Math.round(14 * m.scale) : 0;
    const x = author.isSelf ? width - m.pad - Math.round(130 * m.scale) : m.pad + lane;
    drawTypingBubble(ctx, theme, m, x, offsetY + layout.contentH, frame);
  }

  ctx.restore();

  if (showHeader) drawHeader(ctx, project, theme, width, m, media);
}

