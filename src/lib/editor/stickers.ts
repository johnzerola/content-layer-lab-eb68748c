/**
 * STICKERS ANIMADOS (chamada para ação)
 *
 * Desenhados em vetor, no próprio canvas: a mesma função roda na prévia e no
 * MP4 exportado (inclusive dentro do worker, que não tem DOM). Assim o que o
 * usuário vê é exatamente o que sai no arquivo — sem dependência de assets
 * externos, sem problema de licença e sem download.
 *
 * Cada sticker aceita cor da marca e um texto próprio (@perfil, nome do canal).
 */

export type StickerId =
  | "subscribe"
  | "bell"
  | "follow"
  | "like"
  | "heart-burst"
  | "comment"
  | "share"
  | "arrow-down"
  | "arrow-up"
  | "tap"
  | "swipe-up"
  | "countdown"
  | "new-badge"
  | "progress-ring";

export interface StickerDef {
  id: StickerId;
  label: string;
  /** grupo mostrado na galeria */
  group: "Inscrever" | "Seguir" | "Reagir" | "Apontar" | "Selos";
  /** texto padrão editável */
  text: string;
  /** proporção largura/altura sugerida */
  ratio: number;
  hint: string;
}

export const STICKERS: StickerDef[] = [
  { id: "subscribe", label: "Inscreva-se", group: "Inscrever", text: "INSCREVA-SE", ratio: 3.2, hint: "Botão pulsando com clique" },
  { id: "bell", label: "Sininho", group: "Inscrever", text: "ATIVE O SINO", ratio: 3.2, hint: "Sino balançando" },
  { id: "follow", label: "Seguir perfil", group: "Seguir", text: "@seuperfil", ratio: 3.4, hint: "Avatar + botão seguir" },
  { id: "like", label: "Curtir", group: "Reagir", text: "CURTIR", ratio: 2.6, hint: "Coração batendo" },
  { id: "heart-burst", label: "Explosão de curtidas", group: "Reagir", text: "", ratio: 1, hint: "Corações subindo" },
  { id: "comment", label: "Comente", group: "Reagir", text: "COMENTA AÍ", ratio: 3, hint: "Balão pulsando" },
  { id: "share", label: "Compartilhe", group: "Reagir", text: "ENVIA PRA ALGUÉM", ratio: 3.6, hint: "Seta de envio" },
  { id: "arrow-down", label: "Seta para baixo", group: "Apontar", text: "", ratio: 1, hint: "Seta quicando" },
  { id: "arrow-up", label: "Seta para cima", group: "Apontar", text: "", ratio: 1, hint: "Seta quicando" },
  { id: "tap", label: "Toque aqui", group: "Apontar", text: "", ratio: 1, hint: "Dedo tocando com onda" },
  { id: "swipe-up", label: "Arraste para cima", group: "Apontar", text: "ARRASTA PRA CIMA", ratio: 2.4, hint: "Chevrons subindo" },
  { id: "countdown", label: "Contagem 3-2-1", group: "Selos", text: "3", ratio: 1, hint: "Anel de contagem" },
  { id: "new-badge", label: "Selo NOVO", group: "Selos", text: "NOVO", ratio: 1, hint: "Estrela girando" },
  { id: "progress-ring", label: "Anel de progresso", group: "Selos", text: "", ratio: 1, hint: "Barra circular de tempo" },
];

export interface StickerPaint {
  /** tempo local do sticker, em segundos */
  t: number;
  /** cor principal (normalmente a cor da marca) */
  color: string;
  /** cor de apoio/contraste */
  accent: string;
  text: string;
  fontFamily: string;
  /** multiplicador de velocidade da animação */
  speed: number;
}

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const ease = (v: number) => 0.5 - Math.cos(Math.min(1, Math.max(0, v)) * Math.PI) / 2;

function fitText(ctx: Ctx, text: string, maxW: number, startSize: number, family: string, weight = 800) {
  let size = startSize;
  for (let i = 0; i < 24; i++) {
    ctx.font = `${weight} ${size}px ${family}, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW || size <= 8) break;
    size *= 0.94;
  }
  return size;
}

function pill(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, radius = h / 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function heartPath(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s, cy - s * 0.35, cx - s * 0.5, cy - s, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.35, cx, cy + s * 0.35);
  ctx.closePath();
}

function cursor(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s);
  ctx.lineTo(s * 0.26, s * 0.76);
  ctx.lineTo(s * 0.45, s * 1.12);
  ctx.lineTo(s * 0.62, s * 1.03);
  ctx.lineTo(s * 0.43, s * 0.68);
  ctx.lineTo(s * 0.74, s * 0.62);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = s * 0.06;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function chevron(ctx: Ctx, cx: number, cy: number, w: number, h: number, color: string, thickness: number) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/**
 * Desenha o sticker dentro do retângulo (x, y, w, h).
 * Toda a animação vem de `p.t`, então prévia e exportação batem quadro a quadro.
 */
export function drawSticker(
  ctx: Ctx,
  id: StickerId,
  x: number,
  y: number,
  w: number,
  h: number,
  p: StickerPaint,
) {
  const t = p.t * (p.speed || 1);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const font = p.fontFamily || "Outfit";
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  switch (id) {
    case "subscribe": {
      const pulse = 1 + Math.sin(t * 4) * 0.035;
      const bh = h * 0.72;
      const bw = w * 0.86;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.translate(-cx, -cy);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = h * 0.2;
      pill(ctx, cx - bw / 2, cy - bh / 2, bw, bh, p.color, bh * 0.24);
      ctx.shadowBlur = 0;
      const size = fitText(ctx, p.text || "INSCREVA-SE", bw * 0.82, bh * 0.44, font);
      ctx.fillStyle = p.accent;
      ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillText(p.text || "INSCREVA-SE", cx, cy);
      ctx.restore();
      // clique do mouse a cada 2s
      const cyc = (t % 2) / 2;
      const down = cyc > 0.62 && cyc < 0.78;
      cursor(ctx, cx + bw * 0.24, cy + (down ? bh * 0.1 : bh * 0.16), h * 0.34, p.accent);
      if (down) {
        ctx.beginPath();
        ctx.arc(cx + bw * 0.26, cy + bh * 0.18, h * 0.26 * ease((cyc - 0.62) / 0.16), 0, TAU);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = h * 0.03;
        ctx.stroke();
      }
      break;
    }

    case "bell": {
      const swing = Math.sin(t * 7) * 0.22 * Math.max(0, Math.sin(t * 1.2));
      const bh = h * 0.7;
      const bw = w * 0.86;
      pill(ctx, cx - bw / 2, cy - bh / 2, bw, bh, "rgba(0,0,0,0.55)", bh * 0.3);
      const bellX = cx - bw / 2 + bh * 0.55;
      ctx.save();
      ctx.translate(bellX, cy - bh * 0.12);
      ctx.rotate(swing);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-bh * 0.26, bh * 0.2);
      ctx.quadraticCurveTo(-bh * 0.24, -bh * 0.24, 0, -bh * 0.3);
      ctx.quadraticCurveTo(bh * 0.24, -bh * 0.24, bh * 0.26, bh * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, bh * 0.28, bh * 0.09, 0, TAU);
      ctx.fill();
      ctx.restore();
      const size = fitText(ctx, p.text || "ATIVE O SINO", bw - bh * 1.2, bh * 0.36, font);
      ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.textAlign = "left";
      ctx.fillText(p.text || "ATIVE O SINO", bellX + bh * 0.45, cy);
      break;
    }

    case "follow": {
      const bh = h * 0.78;
      const r = bh / 2;
      pill(ctx, x, cy - bh / 2, w, bh, "rgba(10,10,16,0.72)", r);
      // avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + r, cy, r * 0.78, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(x, cy - r, x + bh, cy + r);
      g.addColorStop(0, p.color);
      g.addColorStop(1, p.accent);
      ctx.fillStyle = g;
      ctx.fillRect(x, cy - r, bh, bh);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x + r, cy, r * 0.78, 0, TAU);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = r * 0.12;
      ctx.stroke();
      // nome
      const label = p.text || "@seuperfil";
      const btnW = w * 0.3;
      const size = fitText(ctx, label, w - bh - btnW - r * 0.6, bh * 0.34, font, 700);
      ctx.font = `700 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, x + bh + r * 0.2, cy);
      // botão seguir pulsando
      const pulse = 1 + Math.sin(t * 5) * 0.05;
      ctx.save();
      ctx.translate(x + w - btnW / 2 - r * 0.3, cy);
      ctx.scale(pulse, pulse);
      pill(ctx, -btnW / 2, -bh * 0.3, btnW, bh * 0.6, p.color, bh * 0.3);
      const bs = fitText(ctx, "SEGUIR", btnW * 0.78, bh * 0.3, font);
      ctx.font = `800 ${bs}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.textAlign = "center";
      ctx.fillText("SEGUIR", 0, 0);
      ctx.restore();
      break;
    }

    case "like": {
      const beat = 1 + Math.abs(Math.sin(t * 3.2)) * 0.14;
      const s = h * 0.34;
      ctx.save();
      ctx.translate(x + h * 0.45, cy);
      ctx.scale(beat, beat);
      heartPath(ctx, 0, 0, s);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = h * 0.25;
      ctx.fill();
      ctx.restore();
      if (p.text) {
        const size = fitText(ctx, p.text, w - h, h * 0.32, font);
        ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
        ctx.fillStyle = p.accent;
        ctx.textAlign = "left";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = h * 0.12;
        ctx.fillText(p.text, x + h * 0.8, cy);
      }
      break;
    }

    case "heart-burst": {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const phase = (t * 0.55 + i / n) % 1;
        const drift = Math.sin((phase + i) * 5) * w * 0.16;
        const s = h * 0.12 * (0.7 + (i % 3) * 0.2);
        ctx.globalAlpha = Math.min(1, (1 - phase) * 1.6);
        heartPath(ctx, cx + drift, y + h - phase * h, s);
        ctx.fillStyle = i % 2 ? p.accent : p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "comment": {
      const pulse = 1 + Math.sin(t * 4) * 0.04;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.translate(-cx, -cy);
      const bh = h * 0.66;
      pill(ctx, x, cy - bh / 2, w, bh, p.color, bh * 0.34);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, cy + bh / 2 - 1);
      ctx.lineTo(x + w * 0.28, cy + bh / 2 + h * 0.16);
      ctx.lineTo(x + w * 0.34, cy + bh / 2 - 1);
      ctx.fillStyle = p.color;
      ctx.fill();
      const size = fitText(ctx, p.text || "COMENTA AÍ", w * 0.82, bh * 0.4, font);
      ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.fillText(p.text || "COMENTA AÍ", cx, cy);
      ctx.restore();
      // três pontinhos digitando
      const dot = h * 0.045;
      for (let i = 0; i < 3; i++) {
        const up = Math.max(0, Math.sin(t * 6 - i * 0.6)) * h * 0.05;
        ctx.beginPath();
        ctx.arc(cx + (i - 1) * dot * 3.2, y + h - dot * 2 - up, dot, 0, TAU);
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.85;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "share": {
      const bh = h * 0.7;
      pill(ctx, x, cy - bh / 2, w, bh, p.color, bh * 0.32);
      const slide = Math.sin(t * 3) * w * 0.02;
      ctx.save();
      ctx.translate(x + bh * 0.55 + slide, cy);
      ctx.beginPath();
      ctx.moveTo(-bh * 0.28, bh * 0.24);
      ctx.lineTo(bh * 0.3, 0);
      ctx.lineTo(-bh * 0.28, -bh * 0.24);
      ctx.lineTo(-bh * 0.16, 0);
      ctx.closePath();
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.restore();
      const size = fitText(ctx, p.text || "ENVIA PRA ALGUÉM", w - bh * 1.3, bh * 0.36, font);
      ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.textAlign = "left";
      ctx.fillText(p.text || "ENVIA PRA ALGUÉM", x + bh, cy);
      break;
    }

    case "arrow-down":
    case "arrow-up": {
      const dir = id === "arrow-down" ? 1 : -1;
      const bounce = Math.sin(t * 4) * h * 0.08 * dir;
      ctx.save();
      ctx.translate(cx, cy + bounce);
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = h * 0.18;
      ctx.beginPath();
      ctx.moveTo(-w * 0.16, -h * 0.32 * dir);
      ctx.lineTo(w * 0.16, -h * 0.32 * dir);
      ctx.lineTo(w * 0.16, h * 0.06 * dir);
      ctx.lineTo(w * 0.34, h * 0.06 * dir);
      ctx.lineTo(0, h * 0.4 * dir);
      ctx.lineTo(-w * 0.34, h * 0.06 * dir);
      ctx.lineTo(-w * 0.16, h * 0.06 * dir);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = h * 0.02;
      ctx.strokeStyle = p.accent;
      ctx.stroke();
      ctx.restore();
      break;
    }

    case "tap": {
      const cyc = t % 1.4;
      const press = cyc < 0.25 ? ease(cyc / 0.25) : cyc < 0.5 ? 1 - ease((cyc - 0.25) / 0.25) : 0;
      for (let i = 0; i < 2; i++) {
        const ph = ((t * 0.9 + i * 0.5) % 1);
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.16 + ph * h * 0.3, 0, TAU);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 1 - ph;
        ctx.lineWidth = h * 0.03;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.14, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.fill();
      cursor(ctx, cx - h * 0.04, cy + h * 0.02 + press * h * 0.05, h * 0.3, p.accent);
      break;
    }

    case "swipe-up": {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.2 + i * 0.33) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI);
        chevron(ctx, cx, y + h * 0.55 - ph * h * 0.4 + i * 0, w * 0.22, h * 0.16, p.color, h * 0.05);
      }
      ctx.globalAlpha = 1;
      if (p.text) {
        const size = fitText(ctx, p.text, w * 0.9, h * 0.2, font);
        ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
        ctx.fillStyle = p.accent;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = h * 0.1;
        ctx.fillText(p.text, cx, y + h * 0.88);
      }
      break;
    }

    case "countdown": {
      const total = Math.max(1, Number(p.text) || 3);
      const left = Math.max(0, total - t);
      const n = Math.ceil(left) || 1;
      const frac = left - Math.floor(left);
      const r = Math.min(w, h) * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.strokeStyle = p.color;
      ctx.lineCap = "round";
      ctx.stroke();
      const pop = 1 + (1 - frac) * 0.12;
      ctx.font = `800 ${r * 1.1 * pop}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.fillText(String(n), cx, cy);
      break;
    }

    case "new-badge": {
      const spin = t * 0.7;
      const r = Math.min(w, h) * 0.44;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * TAU;
        const rad = i % 2 ? r * 0.82 : r;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
      const size = fitText(ctx, p.text || "NOVO", r * 1.4, r * 0.6, font);
      ctx.font = `800 ${size}px ${font}, system-ui, sans-serif`;
      ctx.fillStyle = p.accent;
      ctx.fillText(p.text || "NOVO", cx, cy);
      break;
    }

    case "progress-ring": {
      const r = Math.min(w, h) * 0.42;
      const frac = (t * 0.25) % 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = r * 0.18;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.strokeStyle = p.color;
      ctx.lineCap = "round";
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
