import type { ConversationPlan } from "./clock";
import type { Ctx2D } from "./draw";
import type { ChatTheme } from "./theme";
import { participantOf, threadIdOf, threadOf, type ChatMessage, type ChatSceneProject } from "./types";

export interface NarrativeTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  height: number;
}

/** Wrap every word, including long URLs; never truncate the narrative. */
export function wrapNarrativeText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) { lines.push(line); line = ""; }
      // Break oversized tokens at code points without losing characters.
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

/** Fit the whole block. Imported narratives use short blocks, so remain large. */
export function fitNarrativeText(
  ctx: Ctx2D, text: string, width: number, height: number,
  maxFontSize: number, family: string, weight = 600,
): NarrativeTextLayout {
  const at = (size: number): NarrativeTextLayout => {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapNarrativeText(ctx, text, width);
    return { lines, fontSize: size, lineHeight: size * 1.3, height: lines.length * size * 1.3 };
  };
  const fits = (layout: NarrativeTextLayout) => layout.height <= height &&
    layout.lines.every((line) => ctx.measureText(line).width <= width);
  let layout = at(maxFontSize);
  if (fits(layout)) return layout;
  let low = 0;
  let high = maxFontSize;
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    const candidate = at(mid);
    if (fits(candidate)) { low = mid; layout = candidate; } else high = mid;
  }
  return layout;
}

/** The last block that actually appeared stays visible through its pause. */
export function narrativeMessageAt(project: ChatSceneProject, plan: ConversationPlan, frame: number): ChatMessage | null {
  let active: ChatMessage | null = null;
  for (const message of project.messages) {
    const entry = plan.byId[message.id];
    if (entry && frame >= entry.appearFrame) active = message;
  }
  return active;
}

export function narrativeCardRect(width: number, height: number) {
  const landscape = width > height;
  return {
    x: width * (landscape ? 0.17 : 0.075),
    y: height * (landscape ? 0.14 : 0.145),
    width: width * (landscape ? 0.66 : 0.85),
    maxHeight: height * (landscape ? 0.66 : width === height ? 0.64 : 0.54),
  };
}

interface CardText { title: NarrativeTextLayout; body: NarrativeTextLayout; community: NarrativeTextLayout; author: NarrativeTextLayout }
const textCache = new WeakMap<ChatSceneProject, Map<string, CardText>>();

/** Narrative card only: paintFrame owns the existing background, media and branding. */
export function paintRedditCard(ctx: Ctx2D, project: ChatSceneProject, theme: ChatTheme, plan: ConversationPlan,
  frame: number, width: number, height: number) {
  const active = narrativeMessageAt(project, plan, frame);
  const reference = active ?? project.messages[0];
  const source = reference ? threadOf(project, threadIdOf(project, reference)).storySource : undefined;
  const rect = narrativeCardRect(width, height);
  const scale = Math.min(width, height) / 1080;
  const padding = 36 * scale;
  const innerW = rect.width - padding * 2;
  const family = theme.fontFamily;
  const community = source?.community ? `r/${source.community.replace(/^r\//u, "")}` : "História narrada";
  const author = source?.author ? `u/${source.author.replace(/^u\//u, "")}`
    : source ? "Autoria não informada" : reference ? participantOf(project, reference.participantId).name : "Seu relato";
  const body = active ? active.text.trim() || ({ image: "Imagem", video: "Vídeo", voice: "Mensagem de voz", sticker: "Figurinha" } as Record<string, string>)[active.kind] || "" : "";
  const title = source?.title.trim() || project.title.trim() || "História narrada";
  const metadataH = 76 * scale;
  const titleBudget = Math.min(rect.maxHeight * 0.24, 150 * scale);
  const bodyBudget = Math.max(scale, rect.maxHeight - padding * 2 - metadataH - titleBudget - 50 * scale);
  ctx.save();
  ctx.font = `600 ${52 * scale}px ${family}`;
  // Font-loading changes invalidate measured lines as well as geometry changes.
  const fontMetric = ctx.measureText("Hamburgefontsiv 0123456789").width;
  const key = JSON.stringify([width, height, family, fontMetric, active?.id, title, community, author, body]);
  let cache = textCache.get(project);
  if (!cache) { cache = new Map(); textCache.set(project, cache); }
  let fitted = cache.get(key);
  if (!fitted) {
    fitted = {
      community: fitNarrativeText(ctx, community, innerW - 50 * scale, 34 * scale, 27 * scale, family, 700),
      author: fitNarrativeText(ctx, author, innerW - 50 * scale, 30 * scale, 23 * scale, family, 500),
      title: fitNarrativeText(ctx, title, innerW, titleBudget, 38 * scale, family, 750),
      body: fitNarrativeText(ctx, body, innerW, bodyBudget, 52 * scale, family, 600),
    };
    // Bounded even when the preview is continuously resized.
    if (cache.size >= 512) cache.clear();
    cache.set(key, fitted);
  }
  const bodyY = padding + metadataH + fitted.title.height + 38 * scale;
  const cardH = Math.min(rect.maxHeight, bodyY + fitted.body.height + padding);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 34 * scale;
  ctx.shadowOffsetY = 10 * scale;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, cardH, 26 * scale);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x = rect.x + padding;
  const top = rect.y + padding;
  ctx.fillStyle = "#d93900";
  ctx.beginPath();
  ctx.arc(x + 17 * scale, top + 25 * scale, 17 * scale, 0, Math.PI * 2);
  ctx.fill();
  const drawText = (layout: NarrativeTextLayout, tx: number, ty: number, color: string, weight: number) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${layout.fontSize}px ${family}`;
    layout.lines.forEach((line, index) => ctx.fillText(line, tx, ty + index * layout.lineHeight));
  };
  drawText(fitted.community, x + 50 * scale, top, "#20242b", 700);
  drawText(fitted.author, x + 50 * scale, top + 35 * scale, "#56616c", 500);
  drawText(fitted.title, x, top + metadataH, "#20242b", 750);
  const dividerY = rect.y + bodyY - 21 * scale;
  ctx.fillStyle = "#e7e9eb";
  ctx.fillRect(x, dividerY, innerW, Math.max(1, scale));
  drawText(fitted.body, x, rect.y + bodyY, "#171b20", 600);
  ctx.restore();
}
