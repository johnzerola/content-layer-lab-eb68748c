import type { ReadyTemplate } from "@/lib/editor/template-presets";
import { DEFAULT_BRAND_KIT } from "@/lib/brand-kit";

export function ReadyTemplatePreview({ template }: { template: ReadyTemplate }) {
  const layers = template.build([], { handle: "criador", name: "Seu nome", role: "Conteúdo" }, DEFAULT_BRAND_KIT);
  return <span className="relative block aspect-[9/12] overflow-hidden" style={{ background: template.swatch[0] }} aria-hidden="true">
    {layers.map((layer) => {
      const color = "fill" in layer ? layer.fill : "color" in layer ? layer.color : template.swatch[1];
      return <span key={layer.id} className="absolute overflow-hidden rounded-sm text-center font-semibold" style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, background: "fill" in layer ? color : "transparent", color: "color" in layer ? color : template.swatch[1], fontSize: `${Math.max(7, layer.height * 0.9)}px`, lineHeight: 1.1, opacity: layer.opacity }}>{"text" in layer ? layer.text : ""}</span>;
    })}
    <span className="pointer-events-none absolute inset-x-2 bottom-2 border-t border-white/25 pt-1 text-[8px] font-medium uppercase tracking-wide text-white/80">{template.label}</span>
  </span>;
}
