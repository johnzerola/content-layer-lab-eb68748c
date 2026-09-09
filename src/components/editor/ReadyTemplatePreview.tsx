/**
 * Miniatura 9:16 de um TEMPLATE PRONTO do editor profissional.
 * Só apresentação: monta as camadas do preset e desenha em escala reduzida.
 */
import { useMemo } from "react";
import type { ReadyTemplate } from "@/lib/editor/template-presets";
import { loadAnimIdentity } from "@/lib/editor/animation-library";
import { DEFAULT_BRAND_KIT, loadBrandKit, type BrandKit } from "@/lib/brand-kit";
import type { TemplateLayer } from "@/lib/video-template/types";

const CANVAS_W = 1080;
const CANVAS_H = 1920;

export function ReadyTemplatePreview({
  template,
  className,
}: {
  template: ReadyTemplate;
  className?: string;
}) {
  const brand = useMemo<BrandKit>(() => loadBrandKit() ?? DEFAULT_BRAND_KIT, []);
  const kit = useMemo<BrandKit>(
    () => ({ ...brand, ...(template.palette ?? {}) }) as BrandKit,
    [brand, template],
  );

  const layers = useMemo<TemplateLayer[]>(() => {
    const identity = loadAnimIdentity();
    try {
      return template.build([], { handle: identity.handle, name: identity.name, role: identity.role }, kit);
    } catch {
      return [];
    }
  }, [template, kit]);

  return (
    <span
      className={className ?? "relative block w-full overflow-hidden rounded-md border border-border/60"}
      style={
        {
          aspectRatio: "9 / 16",
          background: template.swatch[0] ?? kit.background,
          containerType: "size",
        } as React.CSSProperties
      }
    >
      {layers.map((l) => {
        const anyL = l as TemplateLayer & Record<string, unknown>;
        const common: React.CSSProperties = {
          position: "absolute",
          left: `${l.x}%`,
          top: `${l.y}%`,
          width: `${l.width}%`,
          height: `${l.height}%`,
        };
        if (l.type === "text" || l.type === "caption") {
          const size = Number(anyL["fontSize"] ?? 40) / CANVAS_H;
          return (
            <span
              key={l.id}
              style={{
                ...common,
                display: "flex",
                alignItems: "center",
                justifyContent:
                  anyL["align"] === "left" ? "flex-start" : anyL["align"] === "right" ? "flex-end" : "center",
                color: String(anyL["color"] ?? template.swatch[1] ?? "#fff"),
                fontFamily: String(anyL["fontFamily"] ?? kit.bodyFont),
                fontWeight: Number(anyL["fontWeight"] ?? 700),
                textTransform: anyL["uppercase"] ? "uppercase" : "none",
                fontSize: `${size * 100}cqh`,
                lineHeight: 1.05,
                overflow: "hidden",
              }}
            >
              {String(anyL["text"] ?? "")}
            </span>
          );
        }
        return (
          <span
            key={l.id}
            style={{
              ...common,
              background: String(anyL["fill"] ?? "#ffffff22"),
              borderRadius: `${(Number(anyL["radius"] ?? 0) / CANVAS_W) * 100}%`,
            }}
          />
        );
      })}
    </span>
  );
}
