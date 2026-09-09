import { useEffect, useState } from "react";
import { clipGain, type AudioRange } from "@/lib/editor/audio-mix";
import { duckGainAt, type EditorAudio } from "@/lib/editor/audio";

/** Keep stem playback on original source time, including seek and clip cuts. */
export function useAudioPreview(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  mediaKey: string | null,
  audio: EditorAudio | undefined,
  speech: AudioRange[] = [],
) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = audio?.originalMuted ?? false;
    video.volume = Math.max(0, Math.min(1, audio?.originalVolume ?? 1));
    setError(null);
    if (!audio) return;
    let alive = true;
    const players = audio.tracks.map((clip) => {
      const el = new Audio(clip.url);
      el.preload = "auto";
      return { clip, el, pending: false, blocked: false };
    });
    const sync = () => {
      if (!alive) return;
      for (const player of players) {
        const { clip, el } = player;
        const local = video.currentTime - clip.startTime;
        const duration =
          clip.duration || (clip.loop ? video.duration - clip.startTime : el.duration);
        const gain =
          clipGain(clip, local, duration) *
          (audio.duckUnderSpeech && clip.kind === "music"
            ? duckGainAt(speech, video.currentTime, audio.duckAmount)
            : 1);
        if (
          !Number.isFinite(el.duration) ||
          local < 0 ||
          local >= duration ||
          (!clip.loop && local >= el.duration) ||
          clip.muted
        ) {
          el.pause();
          continue;
        }
        el.volume = Math.max(0, Math.min(1, gain));
        el.playbackRate = video.playbackRate;
        const desired = clip.loop ? local % el.duration : local;
        if (Math.abs(el.currentTime - desired) > (video.paused ? 0.02 : 0.15))
          el.currentTime = desired;
        if (video.paused || video.ended) el.pause();
        else if (el.paused && !player.pending && !player.blocked) {
          player.pending = true;
          void el
            .play()
            .catch((e: unknown) => {
              if (alive && e instanceof DOMException && e.name !== "AbortError") {
                player.blocked = true;
                setError(
                  "Não consegui reproduzir uma trilha. Clique novamente em Reproduzir ou confira o áudio no painel.",
                );
              }
            })
            .finally(() => {
              player.pending = false;
            });
        }
      }
    };
    const play = () => {
      players.forEach((p) => {
        p.blocked = false;
      });
      sync();
    };
    for (const event of ["pause", "seeking", "seeked", "timeupdate", "ratechange", "ended"])
      video.addEventListener(event, sync);
    video.addEventListener("play", play);
    const timer = setInterval(sync, 80);
    sync();
    return () => {
      alive = false;
      clearInterval(timer);
      video.removeEventListener("play", play);
      for (const event of ["pause", "seeking", "seeked", "timeupdate", "ratechange", "ended"])
        video.removeEventListener(event, sync);
      for (const { el } of players) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [videoRef, mediaKey, audio, speech]);
  return error;
}
