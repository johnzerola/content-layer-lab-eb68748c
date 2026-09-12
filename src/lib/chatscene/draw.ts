/**
 * Desenho da conversa em canvas — camada RENDER.
 *
 * Só lê o documento, o tema e a tabela de tempo. Não muta nada e não conhece
 * React: a mesma função serve para a prévia e para a exportação, o que garante
 * que o arquivo final é idêntico ao que o usuário viu.
 */
import type { ConversationPlan } from "./clock";
import { typingAt } from "./clock";
import type { ChatTheme } from "./theme";
import { participantOf, type ChatMessage, type ChatSceneProject } from "./types";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PaintOptions {
  /** imagens já carregadas, por URL */
  images?: Map<string, CanvasImageSource>;
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
}

function metricsFor(width: number, height: number): Metrics {
  // referência: 1080x1920. Tudo escala pela menor dimensão relativa para que
  // 1:1 e 16:9 não fiquem com texto gigante.
  const scale = Math.min(width / 1080, height / 1920) * (width >= height ? 1.35 : 1);
  const pad = Math.round(48 * scale);
  return {
    scale,
    pad,
    headerH: Math.round(150 * scale),
    bubbleMaxW: Math.round((width - pad * 2) * 0.78),
    fontSize: Math.round(40 * scale),
    lineH: Math.round(52 * scale),
    gap: Math.round(22 * scale),
    avatar: Math.round(56 * scale),
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
  name: string;
  nameColor: string;
  /** altura da imagem dentro da bolha (0 quando não há) */
  mediaH: number;
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
): Layout {
  const m = metricsFor(width, height);
  const isGroup = project.participants.length > 2;
  const items: LaidOutMessage[] = [];
  let y = 0;
  let lastAuthor = "";

  for (const message of messages) {
    const author = participantOf(project, message.participantId);
    const isSelf = author.isSelf;
    const big = message.kind === "emoji" || emojiOnly(message.text);
    const fontSize = big ? m.fontSize * 2.1 : m.fontSize;
    const lineH = big ? m.lineH * 2.1 : m.lineH;
    ctx.font = `${big ? 400 : 500} ${fontSize}px ${theme.fontFamily}`;

    if (message.kind === "system") {
      const lines = wrapText(ctx, message.text, width - m.pad * 4);
      const h = lines.length * lineH + m.gap;
      items.push({
        message,
        lines,
        x: m.pad,
        y,
        width: width - m.pad * 2,
        height: h,
        isSelf: false,
        showName: false,
        name: "",
        nameColor: theme.systemText,
        mediaH: 0,
      });
      y += h + m.gap;
      lastAuthor = "";
      continue;
    }

    const padX = Math.round(28 * m.scale);
    const padY = Math.round(20 * m.scale);
    const avatarLane = isGroup && !isSelf ? m.avatar + Math.round(16 * m.scale) : 0;
    const maxTextW = m.bubbleMaxW - padX * 2 - avatarLane;
    const lines = message.text ? wrapText(ctx, message.text, maxTextW) : [];
    const textW = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);

    const mediaW = message.kind === "image" ? Math.min(maxTextW, m.bubbleMaxW - padX * 2) : 0;
    const mediaH = message.kind === "image" ? Math.round(mediaW / (message.mediaAspect || 1.4)) : 0;

    const showName = isGroup && !isSelf && author.id !== lastAuthor;
    const nameH = showName ? Math.round(m.fontSize * 0.85) + Math.round(8 * m.scale) : 0;

    const bubbleW = Math.max(mediaW, textW) + padX * 2;
    const bubbleH =
      padY * 2 + lines.length * lineH + (mediaH ? mediaH + (lines.length ? Math.round(14 * m.scale) : 0) : 0);

    const x = isSelf ? width - m.pad - bubbleW : m.pad + avatarLane;

    items.push({
      message,
      lines,
      x,
      y: y + nameH,
      width: bubbleW,
      height: bubbleH,
      isSelf,
      showName,
      name: author.name,
      nameColor: author.color,
      mediaH,
    });

    y += nameH + bubbleH + m.gap;
    lastAuthor = author.id;
  }

  return { items, contentH: y, metrics: m };
}

function drawHeader(
  ctx: Ctx2D,
  project: ChatSceneProject,
  theme: ChatTheme,
  width: number,
  m: Metrics,
) {
  ctx.fillStyle = theme.header;
  ctx.fillRect(0, 0, width, m.headerH);
  ctx.fillStyle = theme.divider;
  ctx.fillRect(0, m.headerH - Math.max(1, Math.round(2 * m.scale)), width, Math.max(1, Math.round(2 * m.scale)));

  const peers = project.participants.filter((p) => !p.isSelf);
  const title =
    project.participants.length > 2
      ? project.title || "Grupo"
      : peers[0]?.name ?? project.participants[0]?.name ?? "Conversa";
  const subtitle =
    project.participants.length > 2 ? peers.map((p) => p.name).join(", ") : "online";

  const size = Math.round(72 * m.scale);
  const cx = m.pad + size / 2;
  const cy = m.headerH / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = peers[0]?.color ?? theme.selfBubble;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(32 * m.scale)}px ${theme.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((title[0] ?? "?").toUpperCase(), cx, cy + Math.round(2 * m.scale));

  ctx.textAlign = "left";
  ctx.fillStyle = theme.headerText;
  ctx.font = `600 ${Math.round(36 * m.scale)}px ${theme.fontFamily}`;
  const tx = m.pad + size + Math.round(20 * m.scale);
  const maxW = width - tx - m.pad;
  ctx.fillText(ellipsize(ctx, title, maxW), tx, cy - Math.round(14 * m.scale));
  ctx.fillStyle = theme.headerMuted;
  ctx.font = `400 ${Math.round(26 * m.scale)}px ${theme.fontFamily}`;
  ctx.fillText(ellipsize(ctx, subtitle, maxW), tx, cy + Math.round(24 * m.scale));
  ctx.textBaseline = "alphabetic";
}

function ellipsize(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function drawTypingBubble(
  ctx: Ctx2D,
  theme: ChatTheme,
  m: Metrics,
  x: number,
  y: number,
  frame: number,
) {
  const w = Math.round(140 * m.scale);
  const h = Math.round(76 * m.scale);
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
  const m = metricsFor(width, height);

  // fundo
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, theme.background);
  grad.addColorStop(1, theme.backgroundAlt);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, m.headerH, width, height - m.headerH);

  const visible = project.messages.filter((msg) => {
    const e = plan.byId[msg.id];
    return e ? frame >= e.typingFrame : false;
  });
  const appeared = visible.filter((msg) => frame >= (plan.byId[msg.id]?.appearFrame ?? 0));

  const layout = layoutMessages(ctx, project, theme, appeared, width, height);
  const typing = typingAt(project, plan, frame);
  const typingH = typing ? Math.round(76 * m.scale) + m.gap : 0;

  const areaTop = m.headerH + m.pad;
  // deixa a margem inferior livre para a interface das plataformas
  const areaBottom = height - Math.max(m.pad, Math.round(height * 0.14));
  const areaH = areaBottom - areaTop;
  const total = layout.contentH + typingH;
  // conversa ancorada embaixo, como em um aplicativo de mensagens: as bolhas
  // novas entram na base e empurram as antigas para cima (rolagem automática)
  void areaTop;
  void areaH;
  const offsetY = areaBottom - total;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, m.headerH, width, height - m.headerH);
  ctx.clip();

  for (const item of layout.items) {
    const entry = plan.byId[item.message.id];
    const age = entry ? frame - entry.appearFrame : 0;
    const t = Math.max(0, Math.min(1, age / 7));
    const ease = 1 - Math.pow(1 - t, 3);
    const rise = (1 - ease) * Math.round(28 * m.scale);
    const y = offsetY + item.y + rise;
    ctx.globalAlpha = ease;

    if (item.message.kind === "system") {
      ctx.fillStyle = theme.systemText;
      ctx.font = `500 ${Math.round(28 * m.scale)}px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      item.lines.forEach((line, i) => {
        ctx.fillText(line, width / 2, y + (i + 1) * m.lineH * 0.8);
      });
      ctx.textAlign = "left";
      continue;
    }

    if (item.showName) {
      ctx.fillStyle = item.nameColor;
      ctx.font = `600 ${Math.round(m.fontSize * 0.72)}px ${theme.fontFamily}`;
      ctx.fillText(item.name, item.x + Math.round(10 * m.scale), y - Math.round(10 * m.scale));
    }

    ctx.fillStyle = item.isSelf ? theme.selfBubble : theme.peerBubble;
    roundRect(ctx, item.x, y, item.width, item.height, item.height * theme.radius);
    ctx.fill();

    const padX = Math.round(28 * m.scale);
    const padY = Math.round(20 * m.scale);
    let cursorY = y + padY;

    if (item.mediaH) {
      const src = item.message.mediaUrl ? options.images?.get(item.message.mediaUrl) : undefined;
      const mw = item.width - padX * 2;
      ctx.save();
      roundRect(ctx, item.x + padX, cursorY, mw, item.mediaH, Math.round(18 * m.scale));
      ctx.clip();
      if (src) {
        ctx.drawImage(src, item.x + padX, cursorY, mw, item.mediaH);
      } else {
        ctx.fillStyle = theme.divider;
        ctx.fillRect(item.x + padX, cursorY, mw, item.mediaH);
      }
      ctx.restore();
      cursorY += item.mediaH + (item.lines.length ? Math.round(14 * m.scale) : 0);
    }

    const big = item.message.kind === "emoji" || emojiOnly(item.message.text);
    const fontSize = big ? m.fontSize * 2.1 : m.fontSize;
    const lineH = big ? m.lineH * 2.1 : m.lineH;
    ctx.font = `${big ? 400 : 500} ${fontSize}px ${theme.fontFamily}`;
    ctx.fillStyle = item.isSelf ? theme.selfText : theme.peerText;
    item.lines.forEach((line, i) => {
      ctx.fillText(line, item.x + padX, cursorY + (i + 1) * lineH - lineH * 0.28);
    });
  }

  ctx.globalAlpha = 1;

  if (typing) {
    const author = participantOf(project, typing.participantId);
    const x = author.isSelf ? width - m.pad - Math.round(140 * m.scale) : m.pad;
    drawTypingBubble(ctx, theme, m, x, offsetY + layout.contentH, frame);
  }

  ctx.restore();

  drawHeader(ctx, project, theme, width, m);

  if (options.safeZones) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,90,140,0.75)";
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = Math.max(2, Math.round(3 * m.scale));
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
}
