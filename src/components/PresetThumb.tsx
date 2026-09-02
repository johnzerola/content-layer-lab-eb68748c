import { useMemo } from "react";
import type { ExtraLayer, Template, TextLayer } from "@/lib/template";

/**
 * Miniatura leve de um template (apenas apresentação).
 * Renderiza as camadas em DOM escalado — não usa canvas nem vídeo real.
 */
export function PresetThumb({ template, width = 150 }: { template: Template; width?: number }) {
  const cw = template.canvasW ?? 1080;
  const ch = template.canvasH ?? 1920;
  const s = width / cw;
  const height = ch * s;

  const layers = useMemo(() => {
    const list: { key: string; z: number; node: React.ReactNode }[] = [];
    const px = (n: number) => `${n * s}px`;

    const textNode = (l: TextLayer, key: string) => (
      <div
        key={key}
        style={{
          position: "absolute",
          left: px(l.x),
          top: px(l.y),
          width: px(l.w),
          color: l.color,
          fontSize: `${Math.max(4, l.size * s)}px`,
          fontWeight: Number(l.weight) || 700,
          textAlign: l.align,
          lineHeight: 1.15,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {l.text}
      </div>
    );

    const imgNode = (l: { x: number; y: number; w: number; h: number; src?: string | null; round?: boolean; opacity?: number }, key: string) =>
      l.src ? (
        <img
          key={key}
          src={l.src}
          alt=""
          style={{
            position: "absolute",
            left: px(l.x),
            top: px(l.y),
            width: px(l.w),
            height: px(l.h),
            opacity: l.opacity ?? 1,
            borderRadius: l.round ? "50%" : undefined,
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          key={key}
          style={{
            position: "absolute",
            left: px(l.x),
            top: px(l.y),
            width: px(l.w),
            height: px(l.h),
            borderRadius: l.round ? "50%" : "2px",
            background: "rgba(255,255,255,.18)",
          }}
        />
      );

    if (template.video.visible !== false) {
      const v = template.video;
      list.push({
        key: "video",
        z: v.z ?? 0,
        node: (
          <div
            key="video"
            style={{
              position: "absolute",
              left: px(v.x),
              top: px(v.y),
              width: px(v.w),
              height: px(v.h),
              borderRadius: `${(v.radius ?? 0) * s}px`,
              background: "linear-gradient(140deg,#3f3f46,#18181b)",
              border: "1px solid rgba(255,255,255,.14)",
            }}
          />
        ),
      });
    }

    const texts: [TextLayer, string, number][] = [
      [template.name_, "name", 30],
      [template.handle, "handle", 40],
      [template.headline, "headline", 50],
      [template.cta, "cta", 60],
    ];
    texts.forEach(([l, key, z]) => {
      if (l.visible && l.text) list.push({ key, z: l.z ?? z, node: textNode(l, key) });
    });

    if (template.avatar.visible) list.push({ key: "avatar", z: template.avatar.z ?? 20, node: imgNode(template.avatar, "avatar") });
    if (template.watermark.visible)
      list.push({ key: "wm", z: template.watermark.z ?? 10, node: imgNode(template.watermark, "wm") });

    (template.extras ?? []).forEach((extra: ExtraLayer, i) => {
      if (!extra.visible) return;
      const key = `extra-${i}`;
      const z = extra.z ?? 100 + i;
      if ("src" in extra) list.push({ key, z, node: imgNode(extra, key) });
      else list.push({ key, z, node: textNode(extra, key) });
    });

    return list.sort((a, b) => a.z - b.z);
  }, [template, s]);

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
        background: template.background,
        overflow: "hidden",
        borderRadius: "10px",
      }}
    >
      {layers.map((l) => l.node)}
    </div>
  );
}
