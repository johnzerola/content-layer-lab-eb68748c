/**
 * ConversationRenderer — contrato abstrato de renderização.
 *
 * A prévia e a exportação falam com esta interface, nunca com uma tecnologia
 * específica. Hoje existe uma implementação em canvas 2D; uma implementação
 * baseada em Remotion pode entrar depois sem tocar no documento nem na UI.
 */
import { buildPlan, type ConversationPlan } from "./clock";
import { paintFrame, sceneExitAt } from "./draw";
import { loadMedia, type LoadedMedia } from "./media";
import { resolveTheme } from "./theme";
import { renderSize, threadsOf, type ChatSceneProject } from "./types";

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
  drawFrame(
    target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    ctx: RenderFrameContext,
  ): void;
  plan(project: ChatSceneProject): ConversationPlan;
}

export interface CanvasRendererOptions {
  safeZones?: boolean;
  nativeVideoBackground?: boolean;
  mediaProfile?: "preview" | "export";
}

/** Nunca deixa uma mídia travar o preparo: estourado o prazo, segue sem ela. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

/** Implementação padrão: canvas 2D, determinística e sem dependências extras. */
export class CanvasConversationRenderer implements ConversationRenderer {
  readonly id = "canvas-2d";
  private media = new Map<string, LoadedMedia>();
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
    for (const thread of threadsOf(project)) if (thread.avatarUrl) urls.add(thread.avatarUrl);
    if (project.groupAvatarUrl) urls.add(project.groupAvatarUrl);
    const bg = project.background;
    const bgVideoUrl = bg?.kind === "video" ? bg.videoUrl || bg.imageUrl : undefined;
    if (bg?.kind === "image" && bg.imageUrl) urls.add(bg.imageUrl);
    if (bgVideoUrl && !this.options.nativeVideoBackground) urls.add(bgVideoUrl);
    if (project.branding?.enabled && project.branding.logoUrl) urls.add(project.branding.logoUrl);
    if (project.header?.logoUrl) urls.add(project.header.logoUrl);
    if (project.header?.bgImageUrl) urls.add(project.header.bgImageUrl);
    await Promise.all(
      [...urls]
        .filter((u) => !this.media.has(u))
        .map(async (u) => {
          // fundo em vídeo é decorativo: amostra mais leve e nunca segura a
          // prévia — se demorar ou falhar, o restante abre mesmo assim
          const isBgVideo = u === bgVideoUrl;
          const exportBackground = isBgVideo && this.options.mediaProfile === "export";
          const item = await withTimeout(
            loadMedia(
              u,
              isBgVideo
                ? exportBackground
                  ? { sampleFps: 18, maxSeconds: 10, decodeBudgetMs: 25000, maxSide: 960 }
                  : { sampleFps: 12, maxSeconds: 8, decodeBudgetMs: 12000, maxSide: 720 }
                : {},
            ),
            isBgVideo ? (exportBackground ? 35000 : 22000) : 30000,
          );
          if (item) this.media.set(u, item);
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
    const theme = resolveTheme(project.themeId, project.dark, project.themeOverrides);
    const out = sceneExitAt(project, ctx.plan, ctx.frame);
    const leaving = out.alpha < 1 || out.dy !== 0 || out.scale !== 1;
    if (leaving) {
      // pinta o fundo preto antes de esmaecer, para não sobrar o quadro anterior
      target.save();
      target.fillStyle = "#000";
      target.fillRect(0, 0, ctx.width, ctx.height);
      target.restore();
      target.save();
      target.globalAlpha = Math.max(0, out.alpha);
      target.translate(ctx.width / 2, ctx.height / 2);
      target.scale(out.scale, out.scale);
      target.translate(-ctx.width / 2, -ctx.height / 2 + out.dy);
    }
    paintFrame(target, project, theme, ctx.plan, ctx.frame, ctx.width, ctx.height, {
      media: this.media,
      safeZones: this.options.safeZones ?? false,
      nativeVideoBackground: this.options.nativeVideoBackground ?? false,
    });
    if (leaving) target.restore();
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
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  renderer.drawFrame(ctx, { width, height, frame, plan });
}
