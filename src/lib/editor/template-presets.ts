/**
 * TEMPLATES PRONTOS do editor profissional: montagens de camadas (títulos,
 * faixas, handles, CTA) que o usuário aplica com um clique, além dos templates
 * que ele mesmo salvou. Só montam camadas — nenhuma regra de negócio nova.
 */
import { createShapeLayer, createTextLayer } from "@/lib/video-template/factory";
import type { AnimationSpec, TemplateLayer } from "@/lib/video-template/types";

export interface ReadyTemplate {
  id: string;
  label: string;
  hint: string;
  /** amostra do card: [fundo, texto] */
  swatch: [string, string];
  build: (layers: TemplateLayer[], identity: { handle: string; name: string }) => TemplateLayer[];
}

const anim = (type: string, duration = 0.5, delay = 0): AnimationSpec => ({ type, duration, delay, easing: "easeOut" });

function text(layers: TemplateLayer[], patch: Partial<TemplateLayer> & { text: string }): TemplateLayer {
  return { ...createTextLayer(layers, patch.text), ...patch } as TemplateLayer;
}

function shape(layers: TemplateLayer[], patch: Partial<TemplateLayer>): TemplateLayer {
  return { ...createShapeLayer(layers), ...patch } as TemplateLayer;
}

export const READY_TEMPLATES: ReadyTemplate[] = [
  {
    id: "hook-topo",
    label: "Hook no topo",
    hint: "manchete grande + barra de destaque",
    swatch: ["#ffd93d", "#0b0b12"],
    build: (l) => {
      const bar = shape(l, { name: "Barra do hook", x: 6, y: 6, width: 88, height: 14, fill: "#ffd93d", radius: 20, animationIn: anim("slide-down") } as Partial<TemplateLayer>);
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
        color: "#0b0b12",
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
    build: (l) => {
      const left = shape(l, { name: "Lado Fato", x: 0, y: 0, width: 50, height: 18, fill: "#e5253c", radius: 0 } as Partial<TemplateLayer>);
      const right = shape([...l, left], { name: "Lado Fake", x: 50, y: 0, width: 50, height: 18, fill: "#12a150", radius: 0 } as Partial<TemplateLayer>);
      const a = text([...l, left, right], { name: "FATO", text: "FATO", x: 2, y: 3, width: 46, height: 10, fontSize: 74, fontWeight: 900, uppercase: true, animationIn: anim("slide-right") } as Partial<TemplateLayer> & { text: string });
      const b = text([...l, left, right, a], { name: "FAKE", text: "FAKE", x: 52, y: 3, width: 46, height: 10, fontSize: 74, fontWeight: 900, uppercase: true, animationIn: anim("slide-left") } as Partial<TemplateLayer> & { text: string });
      return [left, right, a, b];
    },
  },
  {
    id: "handle-cta",
    label: "Handle + CTA",
    hint: "@perfil no rodapé e chamada",
    swatch: ["#7c5cff", "#ffffff"],
    build: (l, id) => {
      const pill = shape(l, { name: "Pílula do perfil", x: 26, y: 78, width: 48, height: 7, fill: "#7c5cff", radius: 999, animationIn: anim("pop"), animationLoop: anim("pulse", 2) } as Partial<TemplateLayer>);
      const handle = text([...l, pill], { name: "Handle", text: `@${id.handle}`, x: 26, y: 79, width: 48, height: 5, fontSize: 40, fontWeight: 800, animationIn: anim("fade", 0.4, 0.1) } as Partial<TemplateLayer> & { text: string });
      const cta = text([...l, pill, handle], { name: "CTA", text: "SEGUE PRA PARTE 2", x: 10, y: 88, width: 80, height: 6, fontSize: 46, fontWeight: 900, uppercase: true, animationIn: anim("bounce", 0.6, 0.3) } as Partial<TemplateLayer> & { text: string });
      return [pill, handle, cta];
    },
  },
  {
    id: "lower-third",
    label: "Lower third",
    hint: "nome e cargo com barra fina",
    swatch: ["#0b0b12", "#4cc9f0"],
    build: (l, id) => {
      const bar = shape(l, { name: "Card do nome", x: 6, y: 70, width: 60, height: 10, fill: "#0b0b12cc", radius: 12, animationIn: anim("slide-right") } as Partial<TemplateLayer>);
      const name = text([...l, bar], { name: "Nome", text: id.name, x: 9, y: 71, width: 54, height: 5, fontSize: 44, fontWeight: 800, align: "left", animationIn: anim("fade", 0.4, 0.15) } as Partial<TemplateLayer> & { text: string });
      const role = text([...l, bar, name], { name: "Cargo", text: "Criador de conteúdo", x: 9, y: 76, width: 54, height: 4, fontSize: 30, fontWeight: 600, align: "left", color: "#4cc9f0", animationIn: anim("fade", 0.4, 0.25) } as Partial<TemplateLayer> & { text: string });
      return [bar, name, role];
    },
  },
  {
    id: "barra-progresso",
    label: "Barra de progresso",
    hint: "retenção no rodapé",
    swatch: ["#31f39a", "#0b0b12"],
    build: (l) => [
      shape(l, { name: "Barra de progresso", x: 0, y: 96, width: 100, height: 2, fill: "#31f39a", radius: 0, animationIn: anim("wipe-right", 1) } as Partial<TemplateLayer>),
    ],
  },
  {
    id: "legenda-caixa",
    label: "Título em caixa",
    hint: "manchete de notícia no rodapé",
    swatch: ["#ff3b30", "#ffffff"],
    build: (l) => {
      const box = shape(l, { name: "Caixa da manchete", x: 6, y: 82, width: 88, height: 12, fill: "#111118e6", radius: 14, animationIn: anim("slide-up") } as Partial<TemplateLayer>);
      const head = text([...l, box], { name: "Manchete", text: "Escreva a manchete aqui", x: 8, y: 84, width: 84, height: 8, fontSize: 42, fontWeight: 800, animationIn: anim("fade", 0.4, 0.1) } as Partial<TemplateLayer> & { text: string });
      return [box, head];
    },
  },
];
