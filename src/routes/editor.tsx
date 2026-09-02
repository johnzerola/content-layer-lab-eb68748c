/** Editor standalone: envie um vídeo, crie o projeto e abra o editor profissional — sem passar pelo ViralBatch. */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { SavedProjects } from "@/components/editor/SavedProjects";
import { registerSourceFile } from "@/lib/editor/cuts";
import { createEditorProject } from "@/lib/editor/project";
import { createEditorProjectRecord } from "@/lib/editor/project.service";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor profissional de vídeos verticais — VaiViral" },
      {
        name: "description",
        content: "Envie um vídeo e edite direto: timeline, keyframes, legendas, áudio, transições e exportação em MP4 9:16.",
      },
      { property: "og:title", content: "Editor profissional de vídeos verticais — VaiViral" },
      {
        property: "og:description",
        content: "Timeline com keyframes, legendas por transcrição, trilha de áudio, transições e exportação vertical.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth title="Editor profissional" description="Entre na sua conta para abrir o editor.">
      <EditorLauncher />
    </RequireAuth>
  ),
});

async function probe(file: File): Promise<{ duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve({ duration: v.duration || 0, width: v.videoWidth || 1080, height: v.videoHeight || 1920 });
      v.onerror = () => resolve({ duration: 0, width: 1080, height: 1920 });
      v.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function EditorLauncher() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const open = async (file: File | null) => {
    setBusy(true);
    try {
      const videoId = crypto.randomUUID();
      let meta = { duration: 0, width: 1080, height: 1920 };
      if (file) {
        meta = await probe(file);
        registerSourceFile(videoId, file);
      }
      const doc = createEditorProject(videoId, {
        title: file ? file.name.replace(/\.[^.]+$/, "") : "Novo corte",
        media: { duration: meta.duration, width: meta.width, height: meta.height },
      });
      const record = await createEditorProjectRecord(doc);
      await navigate({
        to: "/projects/$projectId/editor/$videoId",
        params: { projectId: record.id, videoId },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o editor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8">
      <header>
        <p className="mono-label">Editor standalone</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Editor profissional</h1>
        <p className="text-sm text-muted-foreground">
          Timeline com keyframes, legendas por transcrição, trilha de áudio, transições e exportação 1080x1920.
        </p>
      </header>

      <section className="glass rounded-2xl border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm font-medium">Envie um vídeo para começar</p>
        <p className="mt-1 text-xs text-muted-foreground">MP4, MOV ou WebM — o arquivo fica no seu navegador.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <label className="interactive cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
            {busy ? "Abrindo…" : "Escolher vídeo"}
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) void open(f);
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void open(null)}
            className="interactive rounded-lg border border-border/60 px-4 py-2 text-sm disabled:opacity-50"
          >
            Começar em branco
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Projetos recentes</h2>
        <SavedProjects />
      </section>
    </div>
  );
}
