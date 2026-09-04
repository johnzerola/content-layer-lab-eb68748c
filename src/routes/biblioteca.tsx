import { RequireAuth } from "@/components/RequireAuth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, type AppMode } from "@/components/AppShell";
import { ResultLibrary } from "@/components/ResultLibrary";
import { CutLibrary } from "@/components/CutLibrary";
import { TemplateLibrary } from "@/components/TemplateLibrary";
import { CloudPanel } from "@/components/CloudPanel";
import { listJobs } from "@/lib/jobs";
import type { Template } from "@/lib/template";
import { currentUser } from "@/lib/cloud";

export const Route = createFileRoute("/biblioteca")({
  component: GuardedBibliotecaPage,
  head: () => ({
    meta: [
      { title: "Biblioteca de Resultados — VaiViral" },
      {
        name: "description",
        content:
          "Histórico completo de todos os vídeos exportados, organizados por lote e plataforma.",
      },
      { property: "og:title", content: "Biblioteca de Resultados — VaiViral" },
      { property: "og:type", content: "website" },
    ],
  }),
});

function BibliotecaPage() {
  const [mode, setMode] = useState<AppMode>("external");
  const [libOpen, setLibOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const jobs = listJobs();

  return (
    <AppShell
      mode="lote"

      onMode={setMode}
      count={jobs.length}
      onLibrary={() => setLibOpen(true)}
      onCloud={() => setCloudOpen(true)}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Biblioteca de Resultados
          </h1>
          <p className="mt-2 text-muted-foreground">
            Acompanhe e busque todos os vídeos que você já exportou no sistema.
          </p>
        </header>

        <ResultLibrary />

        <div className="mt-10">
          <CutLibrary />
        </div>
      </div>

      {libOpen && (
        <TemplateLibrary
          templates={templates}
          activeId=""
          onClose={() => setLibOpen(false)}
          onChangeList={setTemplates}
          onUse={() => {}}
          onCommit={(t) => t}
        />
      )}

      {cloudOpen && (
        <CloudPanel
          templates={templates}
          onClose={() => setCloudOpen(false)}
          onChangeList={setTemplates}
          mode={mode}
          buildSnapshot={() => ({ items: [] })}
          onRestore={() => {}}
        />
      )}
    </AppShell>
  );
}

function GuardedBibliotecaPage() {
  return (
    <RequireAuth
      title={"Biblioteca requer login"}
      description={"Entre para ver o histórico de vídeos exportados na sua conta."}
    >
      <BibliotecaPage />
    </RequireAuth>
  );
}
