/** Editor standalone: prévia, captura de áudio, narração por IA e exportação até 4K — sem passar pelo ViralBatch. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Mic, Play, Sparkles, Square, Video as VideoIcon } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { RouteShell } from "@/components/RouteShell";
import { SavedProjects } from "@/components/editor/SavedProjects";
import { registerSourceFile } from "@/lib/editor/cuts";
import { uploadSourceFile } from "@/lib/editor/media-cloud";
import { createEditorProject } from "@/lib/editor/project";
import { createEditorProjectRecord } from "@/lib/editor/project.service";
import { createAudioClip, defaultEditorAudio, type AudioClip } from "@/lib/editor/audio";
import { EXPORT_QUALITIES, loadExportQuality, saveExportQuality, type ExportQuality } from "@/lib/editor/export-quality";
import { NARRATION_VOICES, generateNarration } from "@/lib/tts.functions";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor profissional de vídeos verticais — VaiViral" },
      {
        name: "description",
        content:
          "Prévia em tempo real, captura de áudio, narração por IA e exportação até 4K com timeline, keyframes e transições.",
      },
      { property: "og:title", content: "Editor profissional de vídeos verticais — VaiViral" },
      {
        property: "og:description",
        content: "Prévia, gravação de voz, narração por IA e exportação vertical até 2160 × 3840.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth title="Editor profissional" description="Entre na sua conta para abrir o editor.">
        <EditorLauncher />
      </RequireAuth>
    </RouteShell>
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("Não foi possível ler a gravação."));
    fr.readAsDataURL(blob);
  });
}

function EditorLauncher() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [quality, setQuality] = useState<ExportQuality>("1080");

  // trilhas preparadas antes de abrir o editor (gravação e narração)
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState(NARRATION_VOICES[0]!.id);
  const [speed, setSpeed] = useState(1);
  const [narrating, setNarrating] = useState(false);

  useEffect(() => setQuality(loadExportQuality()), []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pick = useCallback(async (f: File) => {
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setMeta(await probe(f));
  }, []);

  const startRec = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const url = await blobToDataUrl(new Blob(parts, { type: rec.mimeType || "audio/webm" }));
        setClips((c) => [...c, createAudioClip({ kind: "voice", name: "Voz gravada", url, volume: 1, fadeIn: 0, fadeOut: 0.2 })]);
        toast.success("Áudio capturado — entra no editor como trilha de voz.");
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }, []);

  const stopRec = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const narrate = useCallback(async () => {
    if (!script.trim()) return;
    setNarrating(true);
    try {
      const out = await generateNarration({ data: { text: script.trim(), voice, speed } });
      setClips((c) => [
        ...c,
        createAudioClip({ kind: "voice", name: `Narração IA · ${voice}`, url: out.dataUrl, volume: 1, fadeIn: 0, fadeOut: 0.3 }),
      ]);
      toast.success("Narração gerada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar narração.");
    } finally {
      setNarrating(false);
    }
  }, [script, voice, speed]);

  const open = async (withFile: File | null) => {
    setBusy(true);
    try {
      const videoId = crypto.randomUUID();
      let info = { duration: 0, width: 1080, height: 1920 };
      if (withFile) {
        info = meta && withFile === file ? meta : await probe(withFile);
        registerSourceFile(videoId, withFile);
      }
      // cópia na conta: o projeto reabre em qualquer aparelho, sem depender
      // do navegador onde foi criado
      const storagePath = withFile ? await uploadSourceFile(videoId, withFile).catch(() => null) : null;
      const doc = createEditorProject(videoId, {
        title: withFile ? withFile.name.replace(/\.[^.]+$/, "") : "Novo corte",
        media: { duration: info.duration, width: info.width, height: info.height, storagePath },
      });
      if (clips.length) doc.audio = { ...defaultEditorAudio(), tracks: clips };
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
          Prévia em tempo real, captura de áudio, narração por IA, timeline com keyframes, transições e exportação até
          4K.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* prévia em tempo real */}
        <section className="glass space-y-3 rounded-2xl border border-border/60 p-4">
          <p className="mono-label">Prévia</p>
          <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border/60 bg-black/60">
            {previewUrl ? (
              <video src={previewUrl} controls playsInline className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <VideoIcon className="h-6 w-6 opacity-60" />
                Escolha um vídeo para ver a prévia
              </div>
            )}
          </div>
          {meta && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {Math.round(meta.duration)}s · {meta.width}×{meta.height}
            </p>
          )}
          <label className="interactive block cursor-pointer rounded-lg bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
            {file ? "Trocar vídeo" : "Escolher vídeo"}
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pick(f);
                 e.currentTarget.value = "";
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void open(file)}
              className="interactive flex-1 rounded-lg border border-border/60 px-3 py-2 text-sm disabled:opacity-50"
            >
              <Play className="mr-1 inline h-3.5 w-3.5" />
              {busy ? "Abrindo…" : "Abrir no editor"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void open(null)}
              className="interactive rounded-lg border border-border/60 px-3 py-2 text-sm disabled:opacity-50"
            >
              Em branco
            </button>
          </div>
        </section>

        <div className="space-y-5">
          {/* captura de áudio + narração */}
          <section className="glass space-y-4 rounded-2xl border border-border/60 p-4">
            <p className="mono-label">Áudio</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (recording ? stopRec() : void startRec())}
                className={`interactive flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  recording ? "bg-destructive text-destructive-foreground" : "border border-border/60"
                }`}
              >
                {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {recording ? "Parar gravação" : "Gravar microfone"}
              </button>
              <span className="text-xs text-muted-foreground">
                A voz captada entra no editor já como trilha, pronta para ajustar volume e ducking.
              </span>
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 p-3">
              <p className="font-mono text-[11px] uppercase text-muted-foreground">Narração por IA (pt-BR)</p>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={3}
                placeholder="Texto que a voz vai narrar…"
                className="w-full rounded-lg border border-border/60 bg-transparent p-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Voz da narração"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="rounded-lg border border-border/60 bg-transparent px-2 py-1.5 text-xs"
                >
                  {NARRATION_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {v.hint}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Velocidade
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                  <span className="font-mono">{speed.toFixed(2)}x</span>
                </label>
                <button
                  type="button"
                  disabled={narrating || !script.trim()}
                  onClick={() => void narrate()}
                  className="interactive ml-auto flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> {narrating ? "Gerando…" : "Gerar narração"}
                </button>
              </div>
            </div>

            {clips.length > 0 && (
              <ul className="space-y-2">
                {clips.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                    <span className="flex-1 truncate text-xs">{c.name}</span>
                    <audio src={c.url} controls className="h-8" />
                    <button
                      type="button"
                      onClick={() => setClips((list) => list.filter((x) => x.id !== c.id))}
                      className="interactive rounded px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* exportação */}
          <section className="glass space-y-3 rounded-2xl border border-border/60 p-4">
            <p className="mono-label">Exportação</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {EXPORT_QUALITIES.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setQuality(q.id);
                    saveExportQuality(q.id);
                    toast.success(`Exportação em ${q.label}.`);
                  }}
                  className={`interactive rounded-xl border p-3 text-left text-xs ${
                    quality === q.id ? "border-primary bg-primary/10" : "border-border/60"
                  }`}
                >
                  <p className="text-sm font-medium">{q.label}</p>
                  <p className="text-muted-foreground">{q.hint}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              A qualidade escolhida vale para todas as renderizações do editor profissional (MP4 H.264 vertical).
            </p>
          </section>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Projetos recentes</h2>
        <SavedProjects />
      </section>
    </div>
  );
}
