import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, Input } from "@/components/ui/base";
import { TemplateCard } from "@/components/vtemplate/TemplateCard";
import { ApplyTemplateModal } from "@/components/vtemplate/ApplyTemplateModal";
import {
  deleteTemplate,
  duplicateTemplate,
  listMyTemplates,
  listPublicTemplates,
} from "@/lib/video-template/service";
import { TEMPLATE_CATEGORIES, type VideoTemplateRecord } from "@/lib/video-template/types";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates de vídeo — VaiViral" },
      { name: "description", content: "Crie templates reutilizáveis com camadas, legendas e branding e aplique em lote nos seus cortes." },
      { property: "og:title", content: "Templates de vídeo — VaiViral" },
      { property: "og:description", content: "Templates reutilizáveis para Reels, TikTok e Shorts, aplicados em lote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const [mine, setMine] = useState<VideoTemplateRecord[]>([]);
  const [publics, setPublics] = useState<VideoTemplateRecord[]>([]);
  const [tab, setTab] = useState<"mine" | "public">("mine");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Todas");
  const [loading, setLoading] = useState(true);
  const [applyTo, setApplyTo] = useState<VideoTemplateRecord | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listMyTemplates(), listPublicTemplates()]);
      setMine(m);
      setPublics(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar os templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const list = useMemo(() => {
    const src = tab === "mine" ? mine : publics;
    return src.filter(
      (t) =>
        (cat === "Todas" || t.category === cat) &&
        (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())),
    );
  }, [tab, mine, publics, cat, q]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Templates de vídeo</h1>
              <p className="text-sm text-muted-foreground">
                Monte um layout uma vez e aplique em centenas de cortes, com legendas e branding automáticos.
              </p>
            </div>
            <Button asChild>
              <Link to="/templates/new">
                <Plus className="mr-1 size-4" /> Criar template
              </Link>
            </Button>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border/70 p-0.5">
              <Button size="sm" variant={tab === "mine" ? "default" : "ghost"} onClick={() => setTab("mine")}>
                Meus ({mine.length})
              </Button>
              <Button size="sm" variant={tab === "public" ? "default" : "ghost"} onClick={() => setTab("public")}>
                Comunidade ({publics.length})
              </Button>
            </div>
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar template" className="h-9 pl-8" aria-label="Buscar template" />
            </div>
            <select
              aria-label="Filtrar por categoria"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {["Todas", ...TEMPLATE_CATEGORIES].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-64 rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {tab === "mine" ? "Você ainda não criou nenhum template." : "Nenhum template público por aqui ainda."}
              </p>
              <Button asChild>
                <Link to="/templates/new">Criar meu primeiro template</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onUse={setApplyTo}
                  onDuplicate={async (tpl) => {
                    try {
                      await duplicateTemplate(tpl);
                      toast.success("Template duplicado.");
                      void load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Falha ao duplicar.");
                    }
                  }}
                  {...(tab === "mine"
                    ? {
                        onDelete: async (tpl: VideoTemplateRecord) => {
                          if (!confirm(`Excluir “${tpl.name}”?`)) return;
                          try {
                            await deleteTemplate(tpl.id);
                            setMine((cur) => cur.filter((x) => x.id !== tpl.id));
                            toast.success("Template excluído.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Falha ao excluir.");
                          }
                        },
                      }
                    : {})}
                />
              ))}
            </div>
          )}
        </div>

        <ApplyTemplateModal
          template={applyTo}
          sources={[]}
          open={!!applyTo}
          onOpenChange={(v) => !v && setApplyTo(null)}
        />
      </AppShell>
    </RequireAuth>
  );
}
