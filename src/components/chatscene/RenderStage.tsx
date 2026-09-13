/**
 * Tela de render: mostra a cena tocando em tempo real (fundo + falas) junto da
 * linha do tempo com as trilhas de fundo, mensagens e vozes.
 *
 * O documento continua sendo o ChatSceneProject (rascunho local do Studio);
 * aqui só lemos, preparamos as falas em segundo plano e reproduzimos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/base";
import { ChatScenePreview } from "@/components/chatscene/ChatScenePreview";
import { RenderTracks } from "@/components/chatscene/RenderTracks";
import { buildPlan } from "@/lib/chatscene/clock";
import { loadLocalDraft } from "@/lib/chatscene/serialize";
import { createDemoChatSceneProject, type ChatSceneProject } from "@/lib/chatscene/types";
import { synthesizeVoice } from "@/lib/chatscene/voice.functions";
import {
  applyVoiceDurations,
  createGatewayVoiceProvider,
  generateCast,
  missingSpeakingMessages,
  speakingMessages,
  type VoiceClip,
} from "@/lib/chatscene/voice-cast";

export function RenderStage() {
  const [project, setProject] = useState<ChatSceneProject>(() => createDemoChatSceneProject());
  const [fromDraft, setFromDraft] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clips, setClips] = useState<Map<string, VoiceClip>>(new Map());
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // abre o rascunho do Studio, quando existir
  useEffect(() => {
    const draft = loadLocalDraft();
    if (draft) {
      setProject(draft.project);
      setFromDraft(true);
    }
  }, []);

  const plan = useMemo(() => buildPlan(project), [project]);
  const speakFn = useServerFn(synthesizeVoice);
  const provider = useMemo(
    () => createGatewayVoiceProvider((input) => speakFn({ data: input })),
    [speakFn],
  );

  const pending = useMemo(() => missingSpeakingMessages(project).length, [project]);
  const speaking = useMemo(() => speakingMessages(project).length, [project]);

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

  useEffect(() => () => abortRef.current?.abort(), []);

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
            <Button size="sm" onClick={() => void prepareVoices()}>
              <Mic className="mr-1.5 size-4" />
              {pending ? `Preparar ${pending} falas` : "Recarregar falas"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <ChatScenePreview
          project={project}
          plan={plan}
          frame={frame}
          playing={playing}
          onFrame={setFrame}
          onPlaying={setPlaying}
          clips={clips}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <RenderTracks project={project} plan={plan} clips={clips} frame={frame} onSeek={setFrame} />
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            Toque em qualquer ponto da linha do tempo para saltar. As falas tocam no mesmo instante
            em que a bolha aparece; enquanto elas são preparadas você pode continuar assistindo.
          </p>
        </div>
      </div>
    </div>
  );
}
