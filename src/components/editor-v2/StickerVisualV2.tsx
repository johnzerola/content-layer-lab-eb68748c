import { useEffect, useRef } from "react";
import { drawSticker, type StickerId } from "@/lib/editor/stickers";
import type { StickerSettings } from "@/lib/editor-v2";

export function StickerVisualV2({ sticker, time, className = "h-full w-full" }: { sticker: StickerSettings; time: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(64, Math.round(rect.width * ratio));
    const height = Math.max(32, Math.round(rect.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawSticker(ctx, sticker.stickerId as StickerId, 1, 1, Math.max(1, width - 2), Math.max(1, height - 2), { t: time, color: sticker.color, accent: sticker.accent, text: sticker.text, fontFamily: "Outfit", speed: sticker.speed });
  }, [sticker, time]);
  return <canvas ref={ref} className={className} aria-hidden />;
}
