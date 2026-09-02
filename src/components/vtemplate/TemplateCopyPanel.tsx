/**
 * IA de copy dentro do editor de template: sugere título, hook e legenda
 * com base no vídeo escolhido (corte salvo ou tema descrito) e no template
 * que está aberto. Aplicar uma sugestão só mexe em camadas de texto.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { aiTemplateCopy, type TemplateCopySuggestion } from "@/lib/ai-template-copy.functions";
import { listLibraryCuts, type LibraryCut } from "@/lib/editor/cuts.service";
import { createTextLayer } from "@/lib/video-template/factory";
import type { TemplateDoc, TemplateLayer, TextLayer } from "@/lib/video-template/types";

interface Props {
  doc: TemplateDoc;
  selected: TemplateLayer | null;
  onAddLayers: (layers: TemplateLayer[]) => void;
  onUpdateLayer: (id: string, patch: Partial<TemplateLayer>) => void;
}

const EMPTY: TemplateCopySuggestion = { titles: [], hooks: [], captions: [], hashtags: [] };

export function TemplateCopyPanel({ doc, selected, onAddLayers, onUpdateLayer }: Props) {
  const [cuts, setCuts] = useState<LibraryCut[]>([]);
  const [cutId, setCutId] = useState<string>("");
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState("direto e viral");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TemplateCopySuggestion>(EMPTY);

  useEffect(() => {
    let alive = true;
    listLibraryCuts()
      .then((list) => alive && setCuts(list))
      .catch(() => {
        /* biblioteca vazia ou sem sessão: o tema livre continua funcionando */
      });
    return () => {
      alive = false;
    };
  }, []);

  const cut = useMemo(() => cuts.find((c) => c.rowId === cutId) ?? null, [cuts, cutId]);

  const layerTexts = useMemo(
    () => doc.layers.filter((l): l is TextLayer => l.type === "text").map((l) => l.text).filter(Boolean),
    [doc.layers],
  );

  const generate = async () => {
    const description = [cut?.caption ?? "", theme].filter(Boolean).join("\n").trim();
    if (!description && !cut) {
      toast.error("Escolha um corte da biblioteca ou descreva o tema do vídeo.");
      return;
    }
    setLoading(true);
    try {
      const data = await aiTemplateCopy({
        data: {
          template: {
            name: doc.name,
            aspectRatio: doc.aspectRatio,
            layerTexts,
            hasCaptions: doc.layers.some((l) => l.type === "caption"),
          },
          video: {
            title: cut?.title ?? "",
            description,
            durationSec: cut ? Math.max(0, cut.end - cut.start) : 0,
          },
          tone,
        },
      });
      setResult(data);
      if (!data.titles.length && !data.hooks.length && !data.captions.length) {
        toast.info("A IA não retornou sugestões. Detalhe melhor o tema do vídeo.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar as sugestões.");
    } finally {
      setLoading(false);
    }
  };

  /** Aplica o texto na camada selecionada; sem seleção, cria uma nova camada. */
  const apply = (text: string) => {
    if (selected && selected.type === "text") {
      onUpdateLayer(selected.id, { text } as Partial<TemplateLayer>);
      toast.success("Texto aplicado na camada selecionada.");
      return;
    }
    onAddLayers([{ ...createTextLayer(doc.layers, text), name: text.slice(0, 24) || "Texto" }]);
    toast.success("Nova camada de texto criada.");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const Group = ({ title, items, canApply }: { title: string; items: string[]; canApply: boolean }) =>
    items.length ? (
      <section className="flex flex-col gap-1.5">
        <h4 className="mono-label">{title}</h4>
        {items.map((text) => (
          <div key={text} className="rounded-lg border border-border/60 bg-card/40 p-2">
            <p className="whitespace-pre-line text-xs leading-snug">{text}</p>
            <div className="mt-1.5 flex gap-1.5">
              {canApply && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => apply(text)}>
                  Aplicar
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void copy(text)}>
                Copiar
              </Button>
            </div>
          </div>
        ))}
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-3 border-b border-border/70 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-medium">IA de copy</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Título, hook e legenda com base no vídeo escolhido e neste template.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="copy-cut">Vídeo (corte salvo)</Label>
        <select
          id="copy-cut"
          value={cutId}
          onChange={(e) => setCutId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">Nenhum — usar só o tema</option>
          {cuts.map((c) => (
            <option key={c.rowId} value={c.rowId}>
              {c.title || c.sourceName || "Corte"} · {Math.round(c.end - c.start)}s
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="copy-theme">Tema / transcrição</Label>
        <textarea
          id="copy-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          rows={3}
          placeholder="Sobre o que é o vídeo, público e objetivo."
          className="rounded-md border border-border bg-background p-2 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="copy-tone">Tom</Label>
        <Input
          id="copy-tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="h-9 text-xs"
          placeholder="direto e viral"
        />
      </div>

      <Button size="sm" onClick={() => void generate()} disabled={loading}>
        <Wand2 className="mr-1.5 size-3.5" />
        {loading ? "Gerando…" : "Gerar sugestões"}
      </Button>

      <Group title="Títulos" items={result.titles} canApply />
      <Group title="Hooks" items={result.hooks} canApply />
      <Group title="Legendas" items={result.captions} canApply />
      {result.hashtags.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="mono-label">Hashtags</h4>
          <p className="text-xs text-muted-foreground">{result.hashtags.join(" ")}</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 self-start px-2 text-[11px]"
            onClick={() => void copy(result.hashtags.join(" "))}
          >
            Copiar hashtags
          </Button>
        </section>
      )}
    </div>
  );
}
