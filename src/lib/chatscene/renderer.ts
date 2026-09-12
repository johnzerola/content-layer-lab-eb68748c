/**
 * ConversationRenderer — contrato abstrato de renderização.
 *
 * A prévia e a exportação falam com esta interface, nunca com uma tecnologia
 * específica. Hoje existe uma implementação em canvas 2D; uma implementação
 * baseada em Remotion pode entrar depois sem tocar no documento nem na UI.
 */
import { buildPlan, type ConversationPlan } from "./clock";
import { paintFrame } from "./draw";
import { resolveTheme } from "./theme";
import { renderSize, type ChatSceneProject } from "./types";

export interface RenderFrameContext {
  width: number;
  height: number;
  frame: number;
  plan: ConversationPlan;
}

export interface ConversationRenderer {
  readonly id: string;
  /** carrega tudo que o desenho precisa (imagens, fontes) antes do primeiro quadro */
  prepare(project: ChatSceneProject): Promise<void>;
  /** desenha um quadro no destino informado */
  drawFrame(target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ctx: RenderFrameContext): void;
  plan(project: ChatSceneProject): ConversationPlan;
}

async function loadImage(url: string): Promise<CanvasImageSource | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    return await new Promise<CanvasImageSource | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  } catch {
    return null;
  }
}

export interface CanvasRendererOptions {
  safeZones?: boolean;
}

/** Implementação padrão: canvas 2D, determinística e sem dependências extras. */
export class CanvasConversationRenderer implements ConversationRenderer {
  readonly id = "canvas-2d";
  private images = new Map<string, CanvasImageSource>();
  private project: ChatSceneProject | null = null;
  private options: CanvasRendererOptions;

  constructor(options: CanvasRendererOptions = {}) {
    this.options = options;
  }

  async prepare(project: ChatSceneProject): Promise<void> {
    this.project = project;
    const urls = new Set<string>();
    for (const m of project.messages) if (m.mediaUrl) urls.add(m.mediaUrl);
    for (const p of project.participants) if (p.avatarUrl) urls.add(p.avatarUrl);
    await Promise.all(
      [...urls]
        .filter((u) => !this.images.has(u))
        .map(async (u) => {
          const img = await loadImage(u);
          if (img) this.images.set(u, img);
        }),
    );
    if (typeof document !== "undefined" && "fonts" in document) {
      try {
        await (document as Document & { fonts: FontFaceSet }).fonts.ready;
      } catch {
        /* fontes do sistema bastam */
      }
    }
  }

  plan(project: ChatSceneProject): ConversationPlan {
    return buildPlan(project);
  }

  drawFrame(
    target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    ctx: RenderFrameContext,
  ): void {
    const project = this.project;
    if (!project) return;
    const theme = resolveTheme(project.themeId, project.dark);
    paintFrame(target, project, theme, ctx.plan, ctx.frame, ctx.width, ctx.height, {
      images: this.images,
      safeZones: this.options.safeZones ?? false,
    });
  }
}

/** Atalho usado pela prévia: desenha um quadro isolado em um canvas visível. */
export function paintPreview(
  canvas: HTMLCanvasElement,
  renderer: ConversationRenderer,
  project: ChatSceneProject,
  plan: ConversationPlan,
  frame: number,
) {
  const { width, height } = renderSize(project.render);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  renderer.drawFrame(ctx, { width, height, frame, plan });
}
