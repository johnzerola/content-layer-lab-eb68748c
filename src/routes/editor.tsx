/** Editor standalone: prévia, captura de áudio, narração por IA e exportação até 4K — sem passar pelo ViralBatch. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  Clock3,
  Download,
  Layers3,
  Mic,
  Play,
  Scissors,
  Sparkles,
  Square,
  UploadCloud,
  Video as VideoIcon,
} from "lucide-react";
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
import { uploadMediaBlob } from "@/lib/media-store";
import { Button } from "@/components/ui/button";

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

/** Guarda a gravação no armazenamento da conta; se não der, embute como antes. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const ref = await uploadMediaBlob("editor-recording", blob);
  if (ref) return ref;
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
  const [dragging, setDragging] = useState(false);

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
    <div className="studio min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/90">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-4 px-4 py-3 md:px-8">
          <Link to="/vendas" className="flex items-center gap-2 font-display text-base font-bold">
            <span className="auth-logo grid size-8 place-items-center rounded-lg text-primary-foreground">V</span>
            VaiViral
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="studio-label">Meu estúdio</span>
          <nav className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/projetos">Todos os projetos</Link>
            </Button>
            <Button asChild size="sm" className="lp-cta-glow">
              <Link to="/editor-demo">Ver demonstração</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="max-w-3xl animate-fade-in">
            <p className="studio-label text-primary">Editor profissional · 9:16</p>
            <h1 className="studio-title mt-3 text-3xl leading-tight sm:text-4xl lg:text-5xl">
              Seus projetos, cortes e exportações em um só lugar.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Envie seu vídeo para abrir a timeline completa, cortar pela transcrição, criar legendas e exportar em MP4.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[{ icon: Scissors, label: "Cortes precisos" }, { icon: Captions, label: "Legendas sincronizadas" }, { icon: Layers3, label: "Timeline multifaixa" }, { icon: Download, label: "MP4 até 4K" }].map(({ icon: Icon, label }) => (
                <span key={label} className="lp-glass inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5 text-primary" /> {label}
                </span>
              ))}
            </div>
          </div>

          <label
            className={`lp-glass relative flex min-h-64 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-6 text-center transition-[border-color,background-color,transform] ${dragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/60"}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped?.type.startsWith("video/")) void pick(dropped);
              else toast.error("Escolha um arquivo de vídeo.");
            }}
          >
            <span className="lp-chip3d mb-4"><UploadCloud /></span>
            <span className="studio-title text-base">Arraste seu vídeo aqui</span>
            <span className="mt-2 text-xs text-muted-foreground">ou clique para escolher um arquivo</span>
            <span className="mt-4 rounded-md bg-surface-3 px-2 py-1 font-mono text-[10px] text-muted-foreground">MP4 · MOV · WEBM</span>
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void pick(selected);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="lp-glass overflow-hidden rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="studio-label">Prévia vertical</p>
                <p className="mt-1 text-xs text-muted-foreground">Seu vídeo no formato do feed</p>
              </div>
              {meta && <span className="rounded-md bg-surface-3 px-2 py-1 font-mono text-[10px] text-muted-foreground">{Math.round(meta.duration)}s</span>}
            </div>
            <div className="relative mx-auto aspect-[9/16] max-h-[31rem] overflow-hidden rounded-xl border border-border bg-surface-3">
              {previewUrl ? (
                <video src={previewUrl} controls playsInline className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-muted-foreground">
                  <VideoIcon className="size-7 text-primary" />
                  A prévia aparece aqui antes de abrir a timeline.
                </div>
              )}
            </div>
            {file && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
                <Clapperboard className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{meta ? `${meta.width}×${meta.height}` : "…"}</span>
              </div>
            )}
            <Button className="mt-3 w-full lp-cta-glow" loading={busy} onClick={() => void open(file)}>
              <Play className="size-4" /> {file ? "Abrir vídeo na timeline" : "Criar projeto em branco"}
            </Button>
          </div>

          <div className="space-y-5">
            <section className="lp-glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="studio-label">Preparação rápida</p>
                  <h2 className="studio-title mt-1 text-lg">Voz e qualidade do projeto</h2>
                </div>
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Salvo automaticamente</span>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Narração e microfone</p>
                    <Button variant={recording ? "destructive" : "outline"} size="sm" onClick={() => (recording ? stopRec() : void startRec())}>
                      {recording ? <Square /> : <Mic />} {recording ? "Parar" : "Gravar"}
                    </Button>
                  </div>
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    rows={3}
                    placeholder="Escreva uma narração em português…"
                    className="w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select aria-label="Voz da narração" value={voice} onChange={(event) => setVoice(event.target.value)} className="min-h-9 flex-1 rounded-lg border border-border bg-surface-2 px-2 text-xs">
                      {NARRATION_VOICES.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.hint}</option>)}
                    </select>
                    <Button size="sm" loading={narrating} disabled={!script.trim()} onClick={() => void narrate()}>
                      <Sparkles /> Gerar voz
                    </Button>
                  </div>
                  <label className="flex items-center gap-3 text-xs text-muted-foreground">
                    Velocidade
                    <input className="min-w-0 flex-1" type="range" min={0.6} max={1.6} step={0.05} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
                    <span className="w-10 font-mono text-foreground">{speed.toFixed(2)}x</span>
                  </label>
                </div>

                <div className="rounded-xl border border-border bg-surface/60 p-4">
                  <p className="text-sm font-semibold">Qualidade de exportação</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    {EXPORT_QUALITIES.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant={quality === item.id ? "default" : "outline"}
                        className="h-auto justify-between px-3 py-2 text-left"
                        onClick={() => { setQuality(item.id); saveExportQuality(item.id); }}
                      >
                        <span>{item.label}</span><span className={quality === item.id ? "text-primary-foreground/70" : "text-muted-foreground"}>{item.hint}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {clips.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {clips.map((clip) => (
                    <li key={clip.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
                      <span className="min-w-28 flex-1 truncate text-xs">{clip.name}</span>
                      <audio src={clip.url} controls className="h-8 max-w-full" />
                      <Button variant="ghost" size="sm" onClick={() => setClips((list) => list.filter((item) => item.id !== clip.id))}>Remover</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              {[{ n: "01", t: "Envie", d: "Arquivo ou projeto em branco" }, { n: "02", t: "Edite", d: "Cortes, camadas e legendas" }, { n: "03", t: "Exporte", d: "MP4 pronto para publicar" }].map((step) => (
                <div key={step.n} className="rounded-xl border border-border bg-surface/50 p-4">
                  <span className="font-mono text-[10px] text-primary">{step.n}</span>
                  <p className="mt-2 text-sm font-semibold">{step.t}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.d}</p>
                </div>
              ))}
            </section>
          </div>
        </section>

        <section className="mt-12 border-t border-border pt-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="studio-label">Continue de onde parou</p>
              <h2 className="studio-title mt-1 text-2xl">Projetos recentes</h2>
            </div>
            <Button variant="outline" onClick={() => void open(null)} disabled={busy}>Novo projeto <ArrowRight /></Button>
          </div>
          <SavedProjects />
        </section>
      </main>
    </div>
  );
}
