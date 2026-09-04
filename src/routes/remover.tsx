/** Remoção direta: sobe o vídeo, ajusta força/referência, processa e abre o resultado no editor. */
import { useCallback, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Download, Eraser, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/RequireAuth";
import { RouteShell } from "@/components/RouteShell";
import { CleanerIAStudio } from "@/components/CleanerIAStudio";
import { registerSourceFile } from "@/lib/editor/cuts";
import { uploadSourceFile } from "@/lib/editor/media-cloud";
import { createEditorProject } from "@/lib/editor/project";
import { createEditorProjectRecord } from "@/lib/editor/project.service";

export const Route = createFileRoute("/remover")({
  head: () => ({
    meta: [
      { title: "Remover legendas e marcas d'água de vídeos — VaiViral" },
      {
        name: "description",
        content:
          "Suba o vídeo, marque a legenda ou a marca d'água e remova com reconstrução temporal do fundo. Sem blur, resultado direto no editor.",
      },
      { property: "og:title", content: "Remover legendas e marcas d'água de vídeos — VaiViral" },
      {
        property: "og:description",
        content:
          "Upload direto, controles de força e tempo de referência, prévia de 5s e resultado aberto no editor profissional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemoverRoute,
});

const MAX_BYTES = 500 * 1024 * 1024;
const MAX_SECONDS = 5 * 60;

interface Item {
  id: string;
  file: File;
  poster: string | null;
  w: number;
  h: number;
}

async function probe(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  let duration = 0;
  let width = 1080;
  let height = 1920;
  let poster: string | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("vídeo ilegível"));
      setTimeout(() => reject(new Error("timeout")), 6000);
    });
    duration = Number.isFinite(video.duration) ? video.duration : 0;
    width = video.videoWidth || width;
    height = video.videoHeight || height;
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = Math.max(1, Math.round((180 * height) / width));
    const ctx = canvas.getContext("2d");
    if (ctx && duration) {
      video.currentTime = Math.min(duration * 0.2, 1);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.onerror = () => resolve();
        setTimeout(resolve, 1500);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster = canvas.toDataURL("image/jpeg", 0.6);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return { duration, width, height, poster };
}

function RemoverPage() {
  const [item, setItem] = useState<Item | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const onFile = useCallback(async (files: FileList | null) => {
    const file = files?.item(0);
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de vídeo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Limite de 500 MB nesta página. Use o CleanerIA para arquivos maiores.");
      return;
    }
    try {
      const info = await probe(file);
      if (info.duration > MAX_SECONDS + 2) {
        toast.error("Limite de 5 minutos nesta página. Use o CleanerIA para vídeos longos.");
        return;
      }
      setResultUrl(null);
      setItem({ id: crypto.randomUUID(), file, poster: info.poster, w: info.width, h: info.height });
    } catch {
      toast.error("Não foi possível ler esse vídeo.");
    }
  }, []);

  const openInEditor = useCallback(async () => {
    if (!resultUrl) return;
    setOpening(true);
    try {
      const blob = await fetch(resultUrl).then((r) => r.blob());
      const name = `${(item?.file.name ?? "video").replace(/\.[^.]+$/, "")}-limpo.mp4`;
      const clean = new File([blob], name, { type: blob.type || "video/mp4" });
      const info = await probe(clean);
      const videoId = crypto.randomUUID();
      registerSourceFile(videoId, clean);
      const storagePath = await uploadSourceFile(videoId, clean).catch(() => null);
      const doc = createEditorProject(videoId, {
        title: name.replace(/\.[^.]+$/, ""),
        media: {
          duration: info.duration,
          width: info.width,
          height: info.height,
          storagePath,
        },
      });
      const record = await createEditorProjectRecord(doc);
      await navigate({
        to: "/projects/$projectId/editor/$videoId",
        params: { projectId: record.id, videoId },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o editor.");
    } finally {
      setOpening(false);
    }
  }, [item, navigate, resultUrl]);

  if (item) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setItem(null)}>
            <ArrowLeft className="mr-1 size-4" /> Trocar vídeo
          </Button>
          <h1 className="font-display text-xl font-bold">Remover legenda e marca d'água</h1>
          {resultUrl && (
            <div className="ml-auto flex items-center gap-2">
              <a
                href={resultUrl}
                download
                className="interactive inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-sm font-semibold"
              >
                <Download className="size-4" /> Baixar MP4
              </a>
              <Button size="sm" onClick={openInEditor} disabled={opening}>
                <Wand2 className="mr-1 size-4" />
                {opening ? "Abrindo…" : "Abrir no editor"}
              </Button>
            </div>
          )}
        </div>

        {resultUrl && (
          <section className="glass grid gap-4 rounded-2xl border border-border/60 p-4 md:grid-cols-[minmax(0,280px)_1fr]">
            <div className="aspect-[9/16] overflow-hidden rounded-xl border border-border/60 bg-black/60">
              <video src={resultUrl} controls playsInline className="h-full w-full object-contain" />
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-display text-base font-semibold text-foreground">Vídeo limpo pronto</p>
              <p>
                O fundo foi reconstruído com contexto temporal — sem blur, mosaico ou corte. Abra no
                editor para adicionar legendas, trilha e branding, ou baixe o MP4 direto.
              </p>
            </div>
          </section>
        )}

        <CleanerIAStudio item={item} onComplete={(url) => setResultUrl(url)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 md:p-10">
      <header className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          <Sparkles className="size-3.5" /> Remoção direta
        </div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">
          Remova legendas e marcas d'água do vídeo
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Suba o arquivo, marque o que sair, ajuste força e tempo de referência, veja a prévia de 5
          segundos e abra o resultado no editor. Reconstrução real do fundo, nunca blur.
        </p>
      </header>

      <div
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="group cursor-pointer rounded-3xl border-2 border-dashed border-border/60 bg-surface/40 p-10 text-center transition hover:border-primary/50 hover:bg-surface/60"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary/10">
          <Upload className="size-7 text-primary" />
        </div>
        <p className="font-display text-lg font-semibold">Arraste um vídeo ou clique para enviar</p>
        <p className="mt-1 text-sm text-muted-foreground">MP4, MOV, WebM · até 5 minutos e 500 MB</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          ["Detecção automática", "Encontra legenda, logo e marca d'água num clique."],
          ["Força e referência", "Você controla a intensidade e quantos segundos servem de fundo."],
          ["Direto no editor", "O vídeo limpo vira projeto para legendar, cortar e publicar."],
        ].map(([title, desc]) => (
          <li key={title} className="rounded-xl border border-border/60 bg-surface/40 p-4">
            <p className="flex items-center gap-1.5 font-display text-sm font-bold">
              <Eraser className="size-3.5 text-primary" /> {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </li>
        ))}
      </ul>

      <p className="text-center text-sm text-muted-foreground">
        Precisa de vídeos maiores ou de máscaras avançadas?{" "}
        <Link to="/limpar-ia" className="font-semibold text-primary">
          Abrir o CleanerIA completo
        </Link>
      </p>
    </div>
  );
}

function RemoverRoute() {
  return (
    <RouteShell>
      <RequireAuth
        title="Entre para remover"
        description="Os vídeos limpos ficam salvos na sua conta, com histórico e download."
      >
        <RemoverPage />
      </RequireAuth>
    </RouteShell>
  );
}
