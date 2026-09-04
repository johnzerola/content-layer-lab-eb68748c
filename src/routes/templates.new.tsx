import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { RouteShell } from "@/components/RouteShell";
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { createTemplateDoc } from "@/lib/video-template/factory";
import { createTemplate } from "@/lib/video-template/service";
import { TEMPLATE_CATEGORIES } from "@/lib/video-template/factory";
import { ASPECT_SIZES, type AspectRatio } from "@/lib/video-template/types";

export const Route = createFileRoute("/templates/new")({
  head: () => ({
    meta: [
      { title: "Criar template de vídeo — VaiViral" },
      { name: "description", content: "Escolha o formato e comece um novo template reutilizável para seus cortes." },
      { property: "og:title", content: "Criar template de vídeo — VaiViral" },
      { property: "og:description", content: "Escolha o formato e comece um novo template reutilizável." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewTemplatePage,
});

const ASPECTS: { id: AspectRatio; label: string; hint: string }[] = [
  { id: "9:16", label: "9:16", hint: "Reels, TikTok, Shorts" },
  { id: "1:1", label: "1:1", hint: "Feed quadrado" },
  { id: "4:5", label: "4:5", hint: "Feed vertical" },
  { id: "16:9", label: "16:9", hint: "YouTube horizontal" },
];

function NewTemplatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("Novo template");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0]!);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const doc = createTemplateDoc(name.trim() || "Novo template", aspect);
      const rec = await createTemplate({ doc, category });
      await navigate({ to: "/templates/$id/edit", params: { id: rec.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar o template.");
      setBusy(false);
    }
  };

  return (
    <RouteShell>
      <RequireAuth title="Criar template" description="Entre na sua conta para criar templates.">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Criar template</h1>
            <p className="text-sm text-muted-foreground">Defina o formato — você pode mudar tudo depois no editor.</p>
          </header>

          <div className="glass flex flex-col gap-4 rounded-2xl p-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name">Nome</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Formato</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAspect(a.id)}
                    className={`interactive flex flex-col items-center gap-2 rounded-xl border p-3 text-xs ${
                      aspect === a.id ? "border-primary bg-primary/10" : "border-border/60"
                    }`}
                  >
                    <span
                      className="rounded-md border border-border/70 bg-muted/40"
                      style={{ width: 44, aspectRatio: `${ASPECT_SIZES[a.id].width}/${ASPECT_SIZES[a.id].height}` }}
                    />
                    <strong>{a.label}</strong>
                    <span className="text-muted-foreground">{a.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-cat">Categoria</Label>
              <select
                id="tpl-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 rounded-md border border-border bg-background px-2 text-sm"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <Button onClick={create} disabled={busy} className="self-start">
              {busy ? "Criando..." : "Abrir editor"}
            </Button>
          </div>
        </div>
      </RequireAuth>
    </RouteShell>
  );
}
