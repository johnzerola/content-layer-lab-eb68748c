import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Images } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { PlanGate } from "@/components/PlanGate";
import { RouteShell } from "@/components/RouteShell";
import { PhotoBatchStudio } from "@/components/photo/PhotoBatchStudio";

const TITLE = "FotoViral — fotos únicas para Instagram, TikTok e Shorts";
const DESCRIPTION =
  "Suba fotos em lote, remova os metadados originais, grave EXIF novo e aplique edições leves anti-duplicidade antes de postar.";

export const Route = createFileRoute("/fotos")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FotosPage,
});

function FotosPage() {
  return (
    <RequireAuth
      title="Entre para usar o FotoViral"
      description="Limpeza de metadados e anti-duplicidade de fotos em lote."
    >
      <RouteShell>
        <PlanGate>
        <main className="mx-auto w-full max-w-6xl px-4 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao painel
          </Link>
          <header className="mt-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Images className="size-5" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">FotoViral</h1>
                <p className="text-sm text-muted-foreground">
                  Metadados limpos, EXIF novo e edição leve — cada foto sai como um arquivo inédito.
                </p>
              </div>
            </div>
          </header>
          <PhotoBatchStudio />
        </main>
        </PlanGate>
      </RouteShell>
    </RequireAuth>
  );
}
