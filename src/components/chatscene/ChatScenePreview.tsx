/** Prévia 9:16 da conversa, com transporte (reproduzir, pausar, linha do tempo). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/base";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import { CanvasConversationRenderer, paintPreview } from "@/lib/chatscene/renderer";
import type { ChatSceneProject } from "@/lib/chatscene/types";
import { renderSize } from "@/lib/chatscene/types";
import { duckingCurve, voiceSchedule } from "@/lib/chatscene/audio-mix";
import { DEFAULT_VOICE_MIX } from "@/lib/chatscene/voice";
import { renderSoundEffect, sfxSchedule } from "@/lib/chatscene/sfx";
import type { VoiceClip } from "@/lib/chatscene/voice-cast";
import { connectDialogue } from "@/lib/chatscene/voice-level";

interface Props {
  project: ChatSceneProject;
  plan: ConversationPlan;
  frame: number;
  playing: boolean;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  /** falas já geradas, para ouvir a conversa na própria prévia */
  clips?: Map<string, VoiceClip>;
  /** trilha de fundo já decodificada, para tocar junto da linha do tempo */
  music?: AudioBuffer | null;
}

export function ChatScenePreview({
  project,
  plan,
  frame,
  playing,
  onFrame,
  onPlaying,
  clips,
  music,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [nativeVideoFailed, setNativeVideoFailed] = useState(false);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const backgroundVideoUrl =
    project.background?.kind === "video"
      ? project.background.videoUrl || project.background.imageUrl || null
      : null;
  const useNativeVideo = Boolean(backgroundVideoUrl) && !nativeVideoFailed;
  const renderer = useMemo(
    () =>
      new CanvasConversationRenderer({
        safeZones: project.render.safeZones,
        nativeVideoBackground: useNativeVideo,
        mediaProfile: "preview",
      }),
    [project.render.safeZones, useNativeVideo],
  );

  useEffect(() => {
    setNativeVideoFailed(false);
  }, [backgroundVideoUrl]);

  // recarrega imagens/fontes quando o conteúdo muda
  useEffect(() => {
    let alive = true;
    setReady(false);
    void renderer.prepare(project).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [renderer, project]);

  // pinta o quadro atual
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    paintPreview(canvas, renderer, project, plan, frame);
  }, [renderer, project, plan, frame, ready]);

  // Preserve the source resolution and cadence by letting the browser decode
  // the background video directly instead of building a low-FPS bitmap cache.
  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video || !backgroundVideoUrl) return;
    const terminal = frameRef.current >= plan.totalFrames - 1;
    const targetSeconds = (terminal ? 0 : frameRef.current) / plan.fps;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const target =
      duration && project.background?.loop !== false
        ? targetSeconds % duration
        : Math.min(targetSeconds, Math.max(0, duration - 0.001));
    if (duration && Math.abs(video.currentTime - target) > 0.12) video.currentTime = target;
    if (playing) void video.play().catch(() => setNativeVideoFailed(true));
    else video.pause();
  }, [playing, backgroundVideoUrl, plan.fps, plan.totalFrames, project.background?.loop]);

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video || !backgroundVideoUrl || playing) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) return;
    const seconds = frame / plan.fps;
    video.currentTime =
      project.background?.loop !== false
        ? seconds % duration
        : Math.min(seconds, Math.max(0, duration - 0.001));
  }, [frame, playing, backgroundVideoUrl, plan.fps, project.background?.loop]);

  // relógio da reprodução: o quadro vem sempre do tempo real decorrido, nunca
  // de um contador acumulado — assim a prévia não "escorrega" do vídeo final
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startFrame = frameRef.current >= plan.totalFrames - 1 ? 0 : frameRef.current;
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const next = startFrame + Math.round(elapsed * plan.fps);
      if (next >= plan.totalFrames - 1) {
        onFrame(plan.totalFrames - 1);
        onPlaying(false);
        return;
      }
      onFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, onFrame, onPlaying]);

  // som da prévia: as falas tocam no mesmo instante em que a bolha aparece
  useEffect(() => {
    const effects = sfxSchedule(project, plan);
    if (!playing || (!clips?.size && !effects.length && !music)) return;
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const fromSec = frameRef.current / plan.fps;
    const sources: AudioBufferSourceNode[] = [];
    const mix = { ...DEFAULT_VOICE_MIX, ...project.voiceMix };
    const schedule = clips?.size ? voiceSchedule(project, plan, clips) : [];
    if (clips?.size) {
      for (const item of schedule) {
        const delay = item.startSec - fromSec;
        if (delay + item.durationSec <= 0) continue;
        const source = ctx.createBufferSource();
        source.buffer = item.clip.buffer;
        source.playbackRate.value = item.rate;
        connectDialogue(ctx, source, ctx.destination, item.gain);
        if (delay >= 0) source.start(ctx.currentTime + delay);
        else source.start(ctx.currentTime, -delay * item.rate);
        sources.push(source);
      }
    }
    // trilha de fundo: entra no mesmo instante da linha do tempo e abaixa
    // automaticamente enquanto alguém fala, para não cobrir as vozes
    if (music && music.duration > 0) {
      const source = ctx.createBufferSource();
      source.buffer = music;
      source.loop = true;
      const gain = ctx.createGain();
      const base = Math.max(0, Math.min(1, mix.musicGain ?? 0.25));
      const curve = duckingCurve(schedule, mix.ducking !== false, {
        ...(mix.duckingAmount === undefined ? {} : { amount: mix.duckingAmount }),
        ...(mix.duckingAttackMs === undefined ? {} : { attackMs: mix.duckingAttackMs }),
        ...(mix.duckingReleaseMs === undefined ? {} : { releaseMs: mix.duckingReleaseMs }),
      });
      let current = curve[0]?.value ?? 1;
      for (const point of curve) if (point.time <= fromSec) current = point.value;
      gain.gain.setValueAtTime(base * current, ctx.currentTime);
      for (const point of curve) {
        if (point.time <= fromSec) continue;
        gain.gain.linearRampToValueAtTime(
          base * point.value,
          ctx.currentTime + (point.time - fromSec),
        );
      }
      source.connect(gain).connect(ctx.destination);
      source.start(ctx.currentTime, fromSec % music.duration);
      sources.push(source);
    }

    // sons curtos de envio e recebimento
    const volume = Math.max(0, Math.min(1, project.sound?.volume ?? 0.5));
    const cache = new Map<string, AudioBuffer>();
    for (const fx of effects) {
      const delay = fx.startSec - fromSec;
      if (delay < 0) continue;
      let buffer = cache.get(fx.effect);
      if (!buffer) {
        buffer = renderSoundEffect(ctx, fx.effect, volume);
        cache.set(fx.effect, buffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(ctx.currentTime + delay);
      sources.push(source);
    }

    return () => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* já parou */
        }
      }
      void ctx.close().catch(() => {});
    };
    // a lista de falas só muda quando o documento ou o plano muda
  }, [playing, clips, project, plan, music]);

  const { width, height } = renderSize(project.render);
  const seconds = (frame / plan.fps).toFixed(1);
  const total = (plan.totalFrames / plan.fps).toFixed(1);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="glass relative mx-auto w-full overflow-hidden rounded-2xl border border-border"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: "min(100%, 380px)" }}
      >
        {useNativeVideo && backgroundVideoUrl && (
          <video
            ref={backgroundVideoRef}
            src={backgroundVideoUrl}
            muted
            playsInline
            preload="auto"
            loop={project.background?.loop !== false}
            aria-hidden="true"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const duration = video.duration > 0 ? video.duration : 0;
              const seconds = frameRef.current / plan.fps;
              if (duration) {
                video.currentTime =
                  project.background?.loop !== false
                    ? seconds % duration
                    : Math.min(seconds, Math.max(0, duration - 0.001));
              }
              if (playing) void video.play().catch(() => setNativeVideoFailed(true));
            }}
            onError={() => setNativeVideoFailed(true)}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            style={{
              filter: project.layout?.backgroundBlur
                ? `blur(${Math.max(0, project.layout.backgroundBlur) / 3}px)`
                : undefined,
              transform: `translateY(${Math.max(-0.3, Math.min(0.3, project.layout?.backgroundOffsetY ?? 0)) * 100}%) scale(${Math.max(1, Math.min(2, project.layout?.backgroundScale ?? 1))})`,
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="relative z-10 h-full w-full"
          aria-label="Prévia da conversa"
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 text-xs text-muted-foreground">
            preparando…
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[380px] items-center gap-2">
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onPlaying(false);
            onFrame(0);
          }}
          aria-label="Voltar ao início"
        >
          <RotateCcw className="size-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(1, plan.totalFrames - 1)}
          value={Math.min(frame, plan.totalFrames - 1)}
          onChange={(e) => {
            onPlaying(false);
            onFrame(Number(e.target.value));
          }}
          className="h-1.5 flex-1 accent-primary"
          aria-label="Linha do tempo da conversa"
        />
        <span className="mono-label shrink-0 text-[11px] text-muted-foreground">
          {seconds}s / {total}s
        </span>
      </div>

      {/* mini linha do tempo: cada traço é uma mensagem; clicar salta até ela */}
      <div className="mx-auto flex w-full max-w-[380px] gap-px overflow-hidden rounded-md border border-border">
        {plan.entries.map((entry, i) => {
          const next = plan.entries[i + 1]?.appearFrame ?? plan.totalFrames;
          const span = Math.max(1, next - entry.appearFrame);
          const active = frame >= entry.appearFrame && frame < next;
          return (
            <button
              key={entry.messageId}
              type="button"
              style={{ flexGrow: span }}
              onClick={() => {
                onPlaying(false);
                onFrame(entry.appearFrame);
              }}
              title={`Mensagem ${i + 1} — ${(entry.appearFrame / plan.fps).toFixed(1)}s`}
              aria-label={`Ir para a mensagem ${i + 1}`}
              className={`h-3 min-w-[3px] transition ${
                active ? "bg-primary" : "bg-muted hover:bg-primary/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
