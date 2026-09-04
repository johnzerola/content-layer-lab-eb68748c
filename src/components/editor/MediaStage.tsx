/**
 * Palco em canvas do editor profissional.
 *
 * Desenha o vídeo com a MESMA função da exportação (`drawMediaFrame`), então
 * enquadramento, keyframes, giro, espelho, fundo, correção de cor, efeitos e
 * transições aparecem na prévia exatamente como saem no MP4.
 * As camadas de texto/sticker continuam sendo editadas pelo `EditorCanvas`
 * por cima deste canvas.
 */
import { useEffect, useRef } from "react";
import {
  composeTransitions,
  preEditFilter,
  segmentTransitionAt,
  transitionAt,
  type PreEdit,
} from "@/lib/preedit";
import { drawMediaFrame, mediaFrameFromPre } from "@/lib/editor/media-frame";
import { applyEffectTransform, type ClipEffect } from "@/lib/editor/effects";
import type { TemplateDoc } from "@/lib/video-template/types";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  composition: TemplateDoc;
  preedit: PreEdit;
  effects?: ClipEffect[];
  clip?: { start: number; end: number } | null;
  onTimeUpdate?: (t: number) => void;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
}

function paintBg(ctx: CanvasRenderingContext2D, doc: TemplateDoc, w: number, h: number) {
  const bg = doc.canvas.background;
  if (bg.kind === "gradient") {
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const g = ctx.createLinearGradient(
      w / 2 - (Math.cos(rad) * w) / 2,
      h / 2 - (Math.sin(rad) * h) / 2,
      w / 2 + (Math.cos(rad) * w) / 2,
      h / 2 + (Math.sin(rad) * h) / 2,
    );
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  } else if (bg.kind === "color") {
    ctx.fillStyle = bg.color === "transparent" ? "#000000" : bg.color;
  } else {
    ctx.fillStyle = "#000000";
  }
  ctx.fillRect(0, 0, w, h);
}

export function MediaStage({
  videoRef,
  src,
  composition,
  preedit,
  effects = [],
  clip = null,
  onTimeUpdate,
  onLoadedMetadata,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({ composition, preedit, effects, clip });
  state.current = { composition, preedit, effects, clip };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const { composition: doc, preedit: pre, effects: fx, clip: window_ } = state.current;
      const W = doc.canvas.width;
      const H = doc.canvas.height;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.clearRect(0, 0, W, H);
      paintBg(ctx, doc, W, H);

      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const tSrc = video.currentTime;

      const tr = composeTransitions(
        transitionAt(pre, tSrc, window_ ?? null),
        segmentTransitionAt(pre, tSrc, window_ ?? null, video.duration || undefined),
      );

      ctx.save();
      applyEffectTransform(ctx, fx, Math.max(0, tSrc - (window_?.start ?? 0)), W, H);
      ctx.globalAlpha = Math.max(0, Math.min(1, tr.alpha));
      if (tr.scale !== 1 || tr.dx || tr.dy) {
        ctx.translate(W / 2 + tr.dx * W, H / 2 + tr.dy * H);
        ctx.scale(tr.scale, tr.scale);
        ctx.translate(-W / 2, -H / 2);
      }

      const frame = mediaFrameFromPre(pre, video.videoWidth, video.videoHeight, tSrc);
      const grade = preEditFilter(pre);
      const videoLayers = doc.layers.filter((l) => l.type === "video" && l.visible);
      if (videoLayers.length === 0) {
        drawMediaFrame(ctx, video, frame, { x: 0, y: 0, w: W, h: H, fit: "cover" }, grade);
      } else {
        for (const layer of videoLayers) {
          if (layer.type !== "video") continue;
          drawMediaFrame(
            ctx,
            video,
            frame,
            {
              x: (layer.x / 100) * W,
              y: (layer.y / 100) * H,
              w: (layer.width / 100) * W,
              h: (layer.height / 100) * H,
              fit: layer.fit ?? "cover",
              radius: layer.radius || 0,
              circle: layer.mask === "circle",
            },
            grade,
          );
        }
      }
      ctx.restore();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <>
      {src ? (
        <video
          ref={videoRef}
          src={src}
          playsInline
          className="pointer-events-none absolute h-px w-px opacity-0"
          aria-hidden
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget)}
        />
      ) : null}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />
      {!src && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">
          Nenhuma mídia carregada. Use “Carregar vídeo” ou cole um link na barra superior.
        </div>
      )}
    </>
  );
}
