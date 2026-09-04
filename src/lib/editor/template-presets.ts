/**
 * TEMPLATES PRONTOS do editor profissional: montagens de camadas (títulos,
 * faixas, handles, CTA) que o usuário aplica com um clique, além dos templates
 * que ele mesmo salvou. Só montam camadas — nenhuma regra de negócio nova.
 *
 * Todos usam as cores e fontes do Brand Kit (sem depender de imagem de logo):
 * a marca aparece como texto/forma, então o template já sai "com a sua cara".
 */
import { createShapeLayer, createTextLayer } from "@/lib/video-template/factory";
import { DEFAULT_BRAND_KIT, type BrandKit } from "@/lib/brand-kit";
import type { AnimationSpec, TemplateLayer } from "@/lib/video-template/types";

export interface TemplateIdentity {
  handle: string;
  name: string;
  role?: string;
}

export interface ReadyTemplate {
  id: string;
  label: string;
  hint: string;
  /** amostra do card: [fundo, texto] */
  swatch: [string, string];
  build: (layers: TemplateLayer[], identity: TemplateIdentity, brand?: BrandKit) => TemplateLayer[];
  /** paleta e tipografia do layout — aplicadas junto com as camadas (sem imagem de logo) */
  palette?: Partial<BrandKit>;
  /** transição de entrada/saída que acompanha o layout */
  transition?: { kind: string; dur: number };
}

const anim = (type: string, duration = 0.5, delay = 0): AnimationSpec => ({ type, duration, delay, easing: "easeOut" });

function text(layers: TemplateLayer[], patch: Partial<TemplateLayer> & { text: string }): TemplateLayer {
  return { ...createTextLayer(layers, patch.text), ...patch } as TemplateLayer;
}

function shape(layers: TemplateLayer[], patch: Partial<TemplateLayer>): TemplateLayer {
  return { ...createShapeLayer(layers), ...patch } as TemplateLayer;
}

const kitOf = (b?: BrandKit): BrandKit => b ?? DEFAULT_BRAND_KIT;

export const READY_TEMPLATES: ReadyTemplate[] = [
  {
    id: "hook-topo",
    label: "Hook no topo",
    hint: "manchete grande + barra de destaque",
    swatch: ["#ffd93d", "#0b0b12"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const bar = shape(l, { name: "Barra do hook", x: 6, y: 6, width: 88, height: 14, fill: k.primary, radius: 20, animationIn: anim("slideDown") } as Partial<TemplateLayer>);
      const title = text([...l, bar], {
        name: "Hook",
        text: "ISSO MUDA TUDO",
        x: 8,
        y: 8,
        width: 84,
        height: 10,
        fontSize: 78,
        fontWeight: 900,
        uppercase: true,
        fontFamily: k.headingFont,
        color: k.text,
        animationIn: anim("pop", 0.45, 0.1),
      } as Partial<TemplateLayer> & { text: string });
      return [bar, title];
    },
  },
  {
    id: "fato-fake",
    label: "Fato x Fake",
    hint: "tela dividida com veredito",
    swatch: ["#e5253c", "#12a150"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const left = shape(l, { name: "Lado Fato", x: 0, y: 0, width: 50, height: 18, fill: "#e5253c", radius: 0 } as Partial<TemplateLayer>);
      const right = shape([...l, left], { name: "Lado Fake", x: 50, y: 0, width: 50, height: 18, fill: "#12a150", radius: 0 } as Partial<TemplateLayer>);
      const a = text([...l, left, right], { name: "FATO", text: "FATO", x: 2, y: 3, width: 46, height: 10, fontSize: 74, fontWeight: 900, uppercase: true, fontFamily: k.headingFont, animationIn: anim("slideRight") } as Partial<TemplateLayer> & { text: string });
      const c = text([...l, left, right, a], { name: "FAKE", text: "FAKE", x: 52, y: 3, width: 46, height: 10, fontSize: 74, fontWeight: 900, uppercase: true, fontFamily: k.headingFont, animationIn: anim("slideLeft") } as Partial<TemplateLayer> & { text: string });
      return [left, right, a, c];
    },
  },
  {
    id: "handle-cta",
    label: "Handle + CTA",
    hint: "@perfil no rodapé e chamada",
    swatch: ["#7c5cff", "#ffffff"],
    build: (l, id, b) => {
      const k = kitOf(b);
      const pill = shape(l, { name: "Pílula do perfil", x: 26, y: 78, width: 48, height: 7, fill: k.primary, radius: 999, animationIn: anim("pop"), animationLoop: anim("pulse", 2) } as Partial<TemplateLayer>);
      const handle = text([...l, pill], { name: "Handle", text: `@${id.handle}`, x: 26, y: 79, width: 48, height: 5, fontSize: 40, fontWeight: 800, fontFamily: k.bodyFont, color: k.text, animationIn: anim("fadeIn", 0.4, 0.1) } as Partial<TemplateLayer> & { text: string });
      const cta = text([...l, pill, handle], { name: "CTA", text: "SEGUE PRA PARTE 2", x: 10, y: 88, width: 80, height: 6, fontSize: 46, fontWeight: 900, uppercase: true, fontFamily: k.headingFont, animationIn: anim("bounce", 0.6, 0.3) } as Partial<TemplateLayer> & { text: string });
      return [pill, handle, cta];
    },
  },
  {
    id: "lower-third",
    label: "Lower third",
    hint: "nome e cargo com barra fina",
    swatch: ["#0b0b12", "#4cc9f0"],
    build: (l, id, b) => {
      const k = kitOf(b);
      const bar = shape(l, { name: "Card do nome", x: 6, y: 70, width: 60, height: 10, fill: `${k.background}cc`, radius: 12, animationIn: anim("slideRight") } as Partial<TemplateLayer>);
      const name = text([...l, bar], { name: "Nome", text: id.name, x: 9, y: 71, width: 54, height: 5, fontSize: 44, fontWeight: 800, align: "left", fontFamily: k.headingFont, color: k.text, animationIn: anim("fadeIn", 0.4, 0.15) } as Partial<TemplateLayer> & { text: string });
      const role = text([...l, bar, name], { name: "Cargo", text: id.role || "Criador de conteúdo", x: 9, y: 76, width: 54, height: 4, fontSize: 30, fontWeight: 600, align: "left", fontFamily: k.bodyFont, color: k.secondary, animationIn: anim("fadeIn", 0.4, 0.25) } as Partial<TemplateLayer> & { text: string });
      return [bar, name, role];
    },
  },
  {
    id: "barra-progresso",
    label: "Barra de progresso",
    hint: "retenção no rodapé",
    swatch: ["#31f39a", "#0b0b12"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const track = shape(l, { name: "Trilho", x: 0, y: 97, width: 100, height: 3, fill: "#ffffff22", radius: 0 } as Partial<TemplateLayer>);
      const bar = shape([...l, track], { name: "Progresso", x: 0, y: 97, width: 100, height: 3, fill: k.secondary, radius: 0, animationIn: anim("slideRight", 8) } as Partial<TemplateLayer>);
      return [track, bar];
    },
  },
  {
    id: "titulo-caixa",
    label: "Título em caixa",
    hint: "manchete de notícia no rodapé",
    swatch: ["#e5253c", "#ffffff"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const box = shape(l, { name: "Caixa", x: 6, y: 76, width: 88, height: 14, fill: `${k.background}e6`, radius: 16, animationIn: anim("slideUp") } as Partial<TemplateLayer>);
      const tag = shape([...l, box], { name: "Etiqueta", x: 8, y: 73, width: 22, height: 5, fill: "#e5253c", radius: 8, animationIn: anim("pop", 0.4, 0.1) } as Partial<TemplateLayer>);
      const tagText = text([...l, box, tag], { name: "Urgente", text: "URGENTE", x: 8, y: 74, width: 22, height: 4, fontSize: 26, fontWeight: 900, uppercase: true, fontFamily: k.headingFont } as Partial<TemplateLayer> & { text: string });
      const title = text([...l, box, tag, tagText], { name: "Manchete", text: "Escreva a manchete aqui", x: 9, y: 78, width: 82, height: 10, fontSize: 48, fontWeight: 800, align: "left", fontFamily: k.headingFont, color: k.text, animationIn: anim("fadeIn", 0.4, 0.2) } as Partial<TemplateLayer> & { text: string });
      return [box, tag, tagText, title];
    },
  },
  {
    id: "marca-canto",
    label: "Marca no canto",
    hint: "assinatura fixa com seu nome",
    swatch: ["#0b0b16", "#7c5cff"],
    build: (l, id, b) => {
      const k = kitOf(b);
      const dot = shape(l, { name: "Ponto da marca", x: 6, y: 5, width: 5, height: 2.8, fill: k.primary, radius: 999, animationIn: anim("pop") } as Partial<TemplateLayer>);
      const mark = text([...l, dot], { name: "Marca", text: id.name || `@${id.handle}`, x: 12, y: 5, width: 50, height: 3.4, fontSize: 34, fontWeight: 800, align: "left", fontFamily: k.headingFont, color: k.text, animationIn: anim("slideRight", 0.4, 0.1) } as Partial<TemplateLayer> & { text: string });
      return [dot, mark];
    },
  },
  {
    id: "legenda-hook-3",
    label: "3 tópicos",
    hint: "lista animada em sequência",
    swatch: ["#22d3ee", "#0b0b16"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const out: TemplateLayer[] = [];
      ["Primeiro ponto", "Segundo ponto", "Terceiro ponto"].forEach((t, i) => {
        const y = 30 + i * 9;
        const pill = shape([...l, ...out], { name: `Item ${i + 1}`, x: 8, y, width: 84, height: 7, fill: `${k.background}d9`, radius: 14, animationIn: anim("slideRight", 0.45, i * 0.25) } as Partial<TemplateLayer>);
        out.push(pill);
        out.push(
          text([...l, ...out], { name: `Texto ${i + 1}`, text: t, x: 11, y: y + 1.2, width: 78, height: 5, fontSize: 40, fontWeight: 700, align: "left", fontFamily: k.bodyFont, color: k.text, animationIn: anim("fadeIn", 0.4, i * 0.25 + 0.1) } as Partial<TemplateLayer> & { text: string }),
        );
      });
      return out;
    },
  },
  {
    id: "quote-editorial",
    label: "Citação editorial",
    hint: "aspas grandes e assinatura",
    swatch: ["#f6f1e7", "#20123a"],
    build: (l, id, b) => {
      const k = kitOf(b);
      const quote = text(l, { name: "Aspas", text: "“", x: 8, y: 26, width: 20, height: 12, fontSize: 160, fontWeight: 900, align: "left", fontFamily: k.headingFont, color: k.primary, animationIn: anim("fadeIn") } as Partial<TemplateLayer> & { text: string });
      const body = text([...l, quote], { name: "Frase", text: "A frase que prende o público", x: 9, y: 40, width: 82, height: 16, fontSize: 56, fontWeight: 700, align: "left", fontFamily: k.headingFont, color: k.text, animationIn: anim("slideUp", 0.5, 0.15) } as Partial<TemplateLayer> & { text: string });
      const sign = text([...l, quote, body], { name: "Assinatura", text: `— ${id.name || id.handle}`, x: 9, y: 58, width: 60, height: 4, fontSize: 32, fontWeight: 600, align: "left", fontFamily: k.bodyFont, color: k.secondary, animationIn: anim("fadeIn", 0.4, 0.35) } as Partial<TemplateLayer> & { text: string });
      return [quote, body, sign];
    },
  },
  {
    id: "contagem",
    label: "Contagem 3-2-1",
    hint: "abertura com números grandes",
    swatch: ["#ff3b6b", "#ffffff"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const out: TemplateLayer[] = [];
      ["3", "2", "1"].forEach((n, i) => {
        const layer = text([...l, ...out], {
          name: `Contagem ${n}`,
          text: n,
          x: 30,
          y: 40,
          width: 40,
          height: 20,
          fontSize: 220,
          fontWeight: 900,
          fontFamily: k.headingFont,
          color: i === 2 ? k.primary : k.text,
          startTime: i * 0.6,
          endTime: i * 0.6 + 0.6,
          animationIn: anim("pop", 0.3),
        } as unknown as Partial<TemplateLayer> & { text: string });
        out.push(layer);
      });
      return out;
    },
  },
  {
    id: "cta-inscreva",
    label: "CTA inscreva-se",
    hint: "botão pulsante com sua marca",
    swatch: ["#7c5cff", "#ffffff"],
    build: (l, id, b) => {
      const k = kitOf(b);
      const btn = shape(l, { name: "Botão", x: 22, y: 84, width: 56, height: 8, fill: k.primary, radius: 999, animationIn: anim("pop"), animationLoop: anim("pulse", 1.6) } as Partial<TemplateLayer>);
      const label = text([...l, btn], { name: "Texto do botão", text: "INSCREVA-SE", x: 22, y: 85.4, width: 56, height: 5, fontSize: 42, fontWeight: 900, uppercase: true, fontFamily: k.headingFont, color: k.text } as Partial<TemplateLayer> & { text: string });
      const who = text([...l, btn, label], { name: "Perfil", text: `@${id.handle}`, x: 22, y: 93, width: 56, height: 3.4, fontSize: 28, fontWeight: 600, fontFamily: k.bodyFont, color: k.secondary } as Partial<TemplateLayer> & { text: string });
      return [btn, label, who];
    },
  },
  {
    id: "faixa-lateral",
    label: "Faixa lateral",
    hint: "coluna de cor com tema do vídeo",
    swatch: ["#22d3ee", "#0b0b16"],
    build: (l, _id, b) => {
      const k = kitOf(b);
      const bar = shape(l, { name: "Faixa", x: 0, y: 22, width: 3, height: 40, fill: k.secondary, radius: 0, animationIn: anim("slideDown", 0.5) } as Partial<TemplateLayer>);
      const topic = text([...l, bar], { name: "Tema", text: "TEMA DO VÍDEO", x: 6, y: 24, width: 70, height: 6, fontSize: 44, fontWeight: 900, uppercase: true, align: "left", fontFamily: k.headingFont, color: k.text, animationIn: anim("slideRight", 0.45, 0.15) } as Partial<TemplateLayer> & { text: string });
      return [bar, topic];
    },
  },
];


/**
 * PALETA, TIPOGRAFIA E TRANSIÇÃO de cada layout pronto. É o que faz o template
 * sair "montado": ao aplicar, as cores e fontes entram no Brand Kit do projeto
 * e a transição entra na pré-edição. Nenhuma imagem de logo é necessária.
 */
const LAYOUT_STYLE: Record<string, { palette: Partial<BrandKit>; transition: { kind: string; dur: number } }> = {
  "hook-topo": {
    palette: { primary: "#ffd93d", secondary: "#ff6b35", text: "#0b0b12", background: "#0b0b12", headingFont: "Anton", bodyFont: "Figtree" },
    transition: { kind: "punch", dur: 0.3 },
  },
  "fato-fake": {
    palette: { primary: "#e5253c", secondary: "#12a150", text: "#ffffff", background: "#0b0b12", headingFont: "Archivo Black", bodyFont: "Inter" },
    transition: { kind: "whip", dur: 0.3 },
  },
  "handle-cta": {
    palette: { primary: "#7c5cff", secondary: "#22d3ee", text: "#ffffff", background: "#0b0b16", headingFont: "Bebas Neue", bodyFont: "Figtree" },
    transition: { kind: "zoom", dur: 0.4 },
  },
  "lower-third": {
    palette: { primary: "#4cc9f0", secondary: "#9bb0c9", text: "#ffffff", background: "#0b0b12", headingFont: "Figtree", bodyFont: "Inter" },
    transition: { kind: "slide-left", dur: 0.4 },
  },
  "barra-progresso": {
    palette: { primary: "#31f39a", secondary: "#31f39a", text: "#ffffff", background: "#0b0b12", headingFont: "Figtree", bodyFont: "Inter" },
    transition: { kind: "fade", dur: 0.3 },
  },
  "titulo-caixa": {
    palette: { primary: "#e5253c", secondary: "#ffd93d", text: "#ffffff", background: "#101018", headingFont: "Archivo Black", bodyFont: "Inter" },
    transition: { kind: "slide-up", dur: 0.35 },
  },
  "marca-canto": {
    palette: { primary: "#7c5cff", secondary: "#c4b5fd", text: "#ffffff", background: "#0b0b16", headingFont: "Bebas Neue", bodyFont: "Figtree" },
    transition: { kind: "fade", dur: 0.25 },
  },
  "legenda-hook-3": {
    palette: { primary: "#22d3ee", secondary: "#7c5cff", text: "#ffffff", background: "#0b0b16", headingFont: "Anton", bodyFont: "Figtree" },
    transition: { kind: "slide-right", dur: 0.4 },
  },
  "quote-editorial": {
    palette: { primary: "#c08a3e", secondary: "#7b6a52", text: "#20123a", background: "#f6f1e7", headingFont: "Playfair Display", bodyFont: "Inter" },
    transition: { kind: "drift", dur: 0.8 },
  },
  contagem: {
    palette: { primary: "#ff3b6b", secondary: "#ffd93d", text: "#ffffff", background: "#0b0b12", headingFont: "Archivo Black", bodyFont: "Figtree" },
    transition: { kind: "punch", dur: 0.25 },
  },
  "cta-inscreva": {
    palette: { primary: "#7c5cff", secondary: "#ffffff", text: "#ffffff", background: "#0b0b16", headingFont: "Bebas Neue", bodyFont: "Figtree" },
    transition: { kind: "zoom-out", dur: 0.4 },
  },
  "faixa-lateral": {
    palette: { primary: "#22d3ee", secondary: "#22d3ee", text: "#ffffff", background: "#0b0b16", headingFont: "Anton", bodyFont: "Inter" },
    transition: { kind: "swing", dur: 0.5 },
  },
};

for (const t of READY_TEMPLATES) {
  const style = LAYOUT_STYLE[t.id];
  if (!style) continue;
  t.palette = style.palette;
  t.transition = style.transition;
  t.swatch = [style.palette.primary ?? t.swatch[0], style.palette.background ?? t.swatch[1]];
}
