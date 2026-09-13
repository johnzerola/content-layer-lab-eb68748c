/**
 * Tela de render: mostra a cena tocando em tempo real (fundo, trilha e falas)
 * junto da linha do tempo, e exporta o vídeo completo para baixar.
 *
 * O documento continua sendo o ChatSceneProject (rascunho local do Studio);
 * aqui só lemos, preparamos as falas em segundo plano e reproduzimos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Mic, Music, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/base";
import { ChatScenePreview } from "@/components/chatscene/ChatScenePreview";
import { RenderTracks } from "@/components/chatscene/RenderTracks";
import { buildPlan } from "@/lib/chatscene/clock";
import { loadMusic, mixConversationAudio } from "@/lib/chatscene/audio-mix";
import { encodeFrameSequence, frameEncoderSupported } from "@/lib/chatscene/encode-frames";
import { CanvasConversationRenderer } from "@/lib/chatscene/renderer";
import { loadLocalDraft } from "@/lib/chatscene/serialize";
import { createDemoChatSceneProject, renderSize, type ChatSceneProject } from "@/lib/chatscene/types";
import { DEFAULT_VOICE_MIX } from "@/lib/chatscene/voice";
import { synthesizeVoice } from "@/lib/chatscene/voice.functions";
import {
  applyVoiceDurations,
  createGatewayVoiceProvider,
  generateCast,
  missingSpeakingMessages,
  speakingMessages,
  type VoiceClip,
} from "@/lib/chatscene/voice-cast";

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "chatscene";

export function RenderStage() {
  const [project, setProject] = useState<ChatSceneProject>(() => createDemoChatSceneProject());
  const [fromDraft, setFromDraft] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clips, setClips] = useState<Map<string, VoiceClip>>(new Map());
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [music, setMusic] = useState<AudioBuffer | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportRatio, setExportRatio] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  // abre o rascunho do Studio, quando existir
  useEffect(() => {
    const draft = loadLocalDraft();
    if (draft) {
      setProject(draft.project);
      setFromDraft(true);
    }
  }, []);

  const plan = useMemo(() => buildPlan(project), [project]);
  const mix = useMemo(() => ({ ...DEFAULT_VOICE_MIX, ...project.voiceMix }), [project.voiceMix]);
  const speakFn = useServerFn(synthesizeVoice);
  const provider = useMemo(
    () => createGatewayVoiceProvider((input) => speakFn({ data: input })),
    [speakFn],
  );

  const pending = useMemo(() => missingSpeakingMessages(project).length, [project]);
  const speaking = useMemo(() => speakingMessages(project).length, [project]);

  // decodifica a trilha uma única vez; o volume muda sem recarregar o arquivo
  useEffect(() => {
    let alive = true;
    if (!mix.musicUrl) {
      setMusic(null);
      return;
    }
    void loadMusic(mix.musicUrl).then((buffer) => {
      if (alive) setMusic(buffer);
    });
    return () => {
      alive = false;
    };
  }, [mix.musicUrl]);

  const setMix = useCallback(
    (changes: Partial<typeof mix>) =>
      setProject((prev) => ({ ...prev, voiceMix: { ...DEFAULT_VOICE_MIX, ...prev.voiceMix, ...changes } })),
    [],
  );

  const setMotion = useCallback(
    (patch: Partial<ChatSceneMotion>) =>
      setProject((prev) => {
        const motion = { ...DEFAULT_MOTION, ...(prev.motion ?? {}), ...patch };
        return { ...prev, motion, animation: motion.enter };
      }),
    [],
  );

  /** Prepara as falas em segundo plano: a prévia continua respondendo. */
  const prepareVoices = useCallback(async () => {
    if (!speaking) {
      toast.error("Esta conversa ainda não tem falas para gerar.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setVoiceBusy(true);
    setProgress({ done: 0, total: speaking });
    try {
      const result = await generateCast(project, provider, {
        batch: 3,
        signal: controller.signal,
        onProgress: (p) => setProgress({ done: p.done, total: p.total }),
      });
      setClips((prev) => {
        const next = new Map(prev);
        for (const [id, clip] of result.clips) next.set(id, clip);
        return next;
      });
      setProject((prev) => applyVoiceDurations(prev, result.durations));
      if (result.failures.length) {
        toast.warning(`${result.clips.size} falas prontas, ${result.failures.length} não saíram.`);
      } else {
        toast.success("Falas prontas. A linha do tempo já mostra a duração real.");
      }
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "Não foi possível preparar as vozes.");
      }
    } finally {
      abortRef.current = null;
      setVoiceBusy(false);
    }
  }, [project, provider, speaking]);

  /** Gera o vídeo completo: fundo escolhido, trilha e falas reais. */
  const handleExport = useCallback(async () => {
    if (!frameEncoderSupported()) {
      toast.error("Este navegador não exporta vídeo. Use o Chrome ou o Edge no computador.");
      return;
    }
    setPlaying(false);
    setExporting(true);
    setExportRatio(0);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      const renderer = new CanvasConversationRenderer({ safeZones: false });
      await renderer.prepare(project);
      const { width, height } = renderSize(project.render);

      let audio: AudioBuffer | null = null;
      if (clips.size || music || project.sound?.enabled) {
        try {
          audio = await mixConversationAudio({ project, plan, clips, settings: mix, music });
        } catch {
          toast.warning("O vídeo sai sem som: não foi possível montar a trilha.");
        }
      }

      const blob = await encodeFrameSequence({
        width,
        height,
        fps: plan.fps,
        totalFrames: plan.totalFrames,
        signal: controller.signal,
        onProgress: setExportRatio,
        audio,
        draw: (ctx, index) => renderer.drawFrame(ctx, { width, height, frame: index, plan }),
      });
      const url = URL.createObjectURL(blob);
      setExportUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(project.title)}.mp4`;
      a.click();
      toast.success("Vídeo pronto. Baixou e já dá para assistir aqui.");
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") toast("Exportação cancelada.");
      else toast.error(err instanceof Error ? err.message : "A exportação falhou.");
    } finally {
      exportAbortRef.current = null;
      setExporting(false);
      setExportRatio(0);
    }
  }, [project, plan, clips, mix, music]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      exportAbortRef.current?.abort();
    },
    [],
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <p className="mono-label text-muted-foreground">Analogue ChatScene</p>
          <h1 className="mt-1 text-xl font-semibold">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            {fromDraft ? "Sua conversa salva" : "Exemplo de demonstração"} ·{" "}
            {(plan.durationMs / 1000).toFixed(1)}s · {project.messages.length} mensagens
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href="/chatscene">Voltar para a edição</a>
          </Button>
          {voiceBusy ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => abortRef.current?.abort()}
              aria-label="Parar de preparar as vozes"
            >
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              {progress.done}/{progress.total} — parar
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void prepareVoices()}>
              <Mic className="mr-1.5 size-4" />
              {pending ? `Preparar ${pending} falas` : "Recarregar falas"}
            </Button>
          )}
          {exporting ? (
            <Button size="sm" variant="secondary" onClick={() => exportAbortRef.current?.abort()}>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              {Math.round(exportRatio * 100)}% — cancelar
            </Button>
          ) : (
            <Button size="sm" onClick={() => void handleExport()}>
              <Download className="mr-1.5 size-4" />
              Gerar vídeo
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ChatScenePreview
            project={project}
            plan={plan}
            frame={frame}
            playing={playing}
            onFrame={setFrame}
            onPlaying={setPlaying}
            clips={clips}
            music={music}
          />
          {exportUrl && (
            <div className="glass rounded-2xl border border-border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Vídeo gerado</p>
              <video src={exportUrl} controls className="w-full rounded-lg" />
              <Button size="sm" variant="secondary" className="mt-2 w-full" asChild>
                <a href={exportUrl} download={`${slugify(project.title)}.mp4`}>
                  <Download className="mr-1.5 size-4" />
                  Baixar de novo
                </a>
              </Button>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <RenderTracks
            project={project}
            plan={plan}
            clips={clips}
            frame={frame}
            hasMusic={!!music}
            onSeek={setFrame}
            onMotion={setMotion}
          />

          <section className="glass rounded-2xl border border-border p-4 text-xs" aria-label="Efeitos de entrada e saída">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Wand2 className="size-4" />
              Efeitos
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Arraste as alças na trilha “Efeitos” para mudar a duração e a força.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="mono-label text-[10px] text-muted-foreground">Entrada das mensagens</span>
                <select
                  className="rounded-md border border-border bg-background/60 px-2 py-1"
                  value={motion.enter}
                  onChange={(e) => setMotion({ enter: e.target.value as ChatSceneMotion["enter"] })}
                >
                  {ANIMATION_PRESETS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="mono-label text-[10px] text-muted-foreground">Saída da cena</span>
                <select
                  className="rounded-md border border-border bg-background/60 px-2 py-1"
                  value={motion.exit}
                  onChange={(e) => setMotion({ exit: e.target.value as ChatSceneMotion["exit"] })}
                >
                  {SCENE_EXIT_PRESETS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="mono-label text-[10px] text-muted-foreground">
                  Força do efeito · {motion.intensity.toFixed(1)}×
                </span>
                <input
                  type="range"
                  min={MOTION_LIMITS.intensity.min}
                  max={MOTION_LIMITS.intensity.max}
                  step={0.1}
                  value={motion.intensity}
                  onChange={(e) => setMotion({ intensity: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="mono-label text-[10px] text-muted-foreground">
                  Duração da saída · {Math.round(motion.exitMs)} ms
                </span>
                <input
                  type="range"
                  min={MOTION_LIMITS.exitMs.min}
                  max={MOTION_LIMITS.exitMs.max}
                  step={50}
                  value={motion.exitMs}
                  onChange={(e) => setMotion({ exitMs: Number(e.target.value) })}
                />
              </label>
            </div>
          </section>

          <section className="glass rounded-2xl border border-border p-4 text-xs" aria-label="Trilha de fundo">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Music className="size-4" />
              Trilha de fundo
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-border bg-background/60 px-2 py-1 hover:border-primary">
                Enviar música
                <input
                  type="file"
                  className="hidden"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) setMix({ musicUrl: URL.createObjectURL(file) });
                  }}
                />
              </label>
              {mix.musicUrl && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline hover:text-primary"
                  onClick={() => setMix({ musicUrl: null })}
                >
                  tirar música
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="mono-label w-16 shrink-0 text-[10px] text-muted-foreground">volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={mix.musicGain}
                onChange={(e) => setMix({ musicGain: Number(e.target.value) })}
                className="flex-1 accent-primary"
                aria-label="Volume da trilha de fundo"
              />
              <span className="mono-label w-10 text-right text-[10px] text-muted-foreground">
                {Math.round((mix.musicGain ?? 0) * 100)}%
              </span>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={mix.ducking !== false}
                onChange={(e) => setMix({ ducking: e.target.checked })}
                className="accent-primary"
              />
              Abaixar a trilha enquanto alguém fala
            </label>
          </section>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            Toque em qualquer ponto da linha do tempo para saltar. A trilha entra no mesmo instante do
            cursor e as falas tocam quando a bolha aparece — o vídeo gerado sai igual ao que você ouve.
          </p>
        </div>
      </div>
    </div>
  );
}
