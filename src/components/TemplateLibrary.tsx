import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, History, RotateCcw, Trash2, Upload, X, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STARTER_PRESETS, type PresetCategory } from "@/lib/presets";
import { PresetThumb } from "@/components/PresetThumb";
import {
  deleteTemplate,
  duplicateTemplate,
  exportTemplate,
  importTemplateFile,
  loadVersions,
  type Template,
  type TemplateVersion,
} from "@/lib/template";

interface Props {
  templates: Template[];
  activeId: string;
  onClose: () => void;
  onChangeList: (list: Template[]) => void;
  onUse: (t: Template) => void;
  /** Salva um template (nova versão) na biblioteca e devolve a versão salva. */
  onCommit: (t: Template, note?: string) => Template | void;

}

const CATEGORIES: ("Todos" | PresetCategory)[] = [
  "Todos",
  "Fofoca",
  "Notícia",
  "Podcast",
  "Viral",
  "UGC",
  "Minimal",
];

const fmt = (ts?: number) =>
  ts ? new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function TemplateLibrary({ templates, activeId, onClose, onChangeList, onUse, onCommit }: Props) {
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<"Todos" | PresetCategory>("Todos");

  const thumbs = useMemo(
    () => Object.fromEntries(STARTER_PRESETS.map((p) => [p.id, p.build()])),
    [],
  );
  const visiblePresets = useMemo(
    () => STARTER_PRESETS.filter((p) => category === "Todos" || p.category === category),
    [category],
  );

  useEffect(() => {
    setVersions(openHistory ? loadVersions(openHistory) : []);
  }, [openHistory, templates]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur">
      <div className="panel my-6 w-full max-w-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="mono-label">Biblioteca</p>
            <h2 className="text-lg font-semibold">Meus templates ({templates.length})</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Importar
            </Button>
            <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const t = await importTemplateFile(f);
              onCommit(t, "importado");
              setError(null);
            } catch {
              setError("Não consegui ler esse arquivo de template.");
            }
          }}
        />

        {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

        <div className="mb-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="mono-label">Modelos prontos ({STARTER_PRESETS.length})</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                    category === c
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePresets.map((p) => (
              <div
                key={p.id}
                className="group flex gap-3 rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-primary"
              >
                <div className="shrink-0 overflow-hidden rounded-lg border border-border/70">
                  <PresetThumb template={thumbs[p.id]!} width={78} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <span
                    className="mt-1 inline-block w-fit rounded-full px-2 py-0.5 text-[11px]"
                    style={{ color: p.accent, border: `1px solid ${p.accent}55` }}
                  >
                    {p.tag}
                  </span>
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                    {p.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => {
                      const t = p.build();
                      onUse(onCommit(t, "modelo pronto") || t);
                    }}
                  >
                    Usar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>


        {templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum template seu ainda — comece por um modelo pronto acima.
          </p>

        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {renaming === t.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="field text-sm"
                        />
                        <button
                          className="rounded-md border border-border p-1.5 hover:border-primary"
                          onClick={() => {
                            onCommit({ ...t, name: draftName.trim() || t.name }, "renomeado");
                            setRenaming(null);
                          }}
                        >
                          <Check className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="truncate text-left text-sm font-semibold"
                        onClick={() => {
                          setRenaming(t.id);
                          setDraftName(t.name);
                        }}
                      >
                        {t.name}
                        {t.id === activeId && <span className="ml-2 text-[11px] text-primary">● ativo</span>}
                      </button>
                    )}
                    <p className="text-[12px] text-muted-foreground">
                      v{t.version ?? 1} · {fmt(t.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => onUse(t)}>
                      Usar
                    </Button>
                    <button
                      title="Histórico de versões"
                      className="rounded-md border border-border p-2 hover:border-primary"
                      onClick={() => setOpenHistory(openHistory === t.id ? null : t.id)}
                    >
                      <History className="size-3.5" />
                    </button>
                    <button
                      title="Duplicar"
                      className="rounded-md border border-border p-2 hover:border-primary"
                      onClick={() => onCommit(duplicateTemplate(t), "duplicado")}
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      title="Exportar JSON"
                      className="rounded-md border border-border p-2 hover:border-primary"
                      onClick={() => exportTemplate(t)}
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      title="Excluir"
                      className="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"
                      onClick={() => onChangeList(deleteTemplate(templates, t.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {openHistory === t.id && (
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    <p className="mono-label">Versões</p>
                    {versions.length === 0 && (
                      <p className="text-[12px] text-muted-foreground">sem histórico ainda</p>
                    )}
                    {versions.map((v) => (
                      <div key={v.version} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">
                          v{v.version} · {fmt(v.savedAt)}
                          {v.note ? ` · ${v.note}` : ""}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono hover:border-primary"
                            onClick={() => onUse({ ...v.snapshot })}
                          >
                            Usar
                          </button>
                          <button
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono hover:border-primary"
                            onClick={() => onCommit({ ...v.snapshot }, `restaurado da v${v.version}`)}
                          >
                            <RotateCcw className="size-3" /> Restaurar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
