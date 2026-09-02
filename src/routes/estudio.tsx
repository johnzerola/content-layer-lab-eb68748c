import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, CircleStop, Mic, Pause, Play, RefreshCcw, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { registerSourceFile } from "@/lib/editor/cuts";
import { createEditorProject } from "@/lib/editor/project";
import { createEditorProjectRecord } from "@/lib/editor/project.service";

export const Route = createFileRoute("/estudio")({
  head: () => ({
    meta: [
      { title: "Estúdio de gravação — VaiViral" },
      { name: "description", content: "Grave câmera e microfone e abra a captura diretamente no editor profissional." },
      { property: "og:title", content: "Estúdio de gravação — VaiViral" },
      { property: "og:description", content: "Capture vídeos e transforme a gravação em um corte editável." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth title="Estúdio" description="Entre na sua conta para gravar um novo corte.">
      <StudioPage />
    </RequireAuth>
  ),
});

type RecorderState = "idle" | "ready" | "recording" | "paused" | "review";

function supportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/mp4;codecs=h264,aac", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function StudioPage() {
  const navigate = useNavigate({ from: "/estudio" });
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [status, setStatus] = useState<RecorderState>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [capture, setCapture] = useState<{ blob: Blob; url: string; duration: number } | null>(null);
  const [opening, setOpening] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  };

  const startPreview = async (nextCameraId = cameraId, nextMicrophoneId = microphoneId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Este navegador não oferece captura de câmera e microfone.");
      return;
    }
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: nextCameraId ? { deviceId: { exact: nextCameraId }, width: { ideal: 1080 }, height: { ideal: 1920 } } : true,
        audio: nextMicrophoneId ? { deviceId: { exact: nextMicrophoneId }, echoCancellation: true, noiseSuppression: true } : true,
      });
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => { track.enabled = cameraEnabled; });
      stream.getAudioTracks().forEach((track) => { track.enabled = microphoneEnabled; });
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play().catch(() => undefined);
      }
      const available = await navigator.mediaDevices.enumerateDevices();
      setDevices(available);
      setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? nextCameraId);
      setMicrophoneId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? nextMicrophoneId);
      setStatus("ready");
    } catch (error) {
      setStatus("idle");
      toast.error(error instanceof Error && error.name === "NotAllowedError"
        ? "Permita o acesso à câmera e ao microfone para abrir o estúdio."
        : "Não foi possível iniciar a câmera e o microfone.");
    }
  };

  useEffect(() => () => {
    recorderRef.current?.stop();
    stopStream();
    if (capture) URL.revokeObjectURL(capture.url);
  }, [capture]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const toggleCamera = () => {
    const next = !cameraEnabled;
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  };

  const toggleMicrophone = () => {
    const next = !microphoneEnabled;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicrophoneEnabled(next);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = supportedMimeType();
    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setCapture((previous) => {
          if (previous) URL.revokeObjectURL(previous.url);
          return { blob, url, duration: elapsed };
        });
        setStatus("review");
      };
      setElapsed(0);
      recorder.start(500);
      setStatus("recording");
    } catch {
      toast.error("Não foi possível iniciar a gravação neste navegador.");
    }
  };

  const pauseOrResume = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setStatus("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setStatus("recording");
    }
  };

  const finishRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const discard = () => {
    if (capture) URL.revokeObjectURL(capture.url);
    setCapture(null);
    setElapsed(0);
    setStatus(streamRef.current ? "ready" : "idle");
  };

  const openInEditor = async () => {
    if (!capture) return;
    setOpening(true);
    try {
      const videoId = crypto.randomUUID();
      const projectId = crypto.randomUUID();
      const extension = capture.blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([capture.blob], `gravacao-${Date.now()}.${extension}`, { type: capture.blob.type });
      registerSourceFile(videoId, file);
      const doc = createEditorProject(videoId, {
        title: `Gravação ${new Date().toLocaleDateString("pt-BR")}`,
        media: { duration: capture.duration },
      });
      const record = await createEditorProjectRecord(doc, projectId);
      stopStream();
      await navigate({ to: "/projects/$projectId/editor/$videoId", params: { projectId: record.id, videoId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a gravação no editor.");
      setOpening(false);
    }
  };

  const cameras = devices.filter((device) => device.kind === "videoinput");
  const microphones = devices.filter((device) => device.kind === "audioinput");

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-primary">VaiViral Studio</p>
          <h1 className="font-display text-xl font-semibold">Gravar novo corte</h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          {status === "recording" && <span className="size-2 animate-pulse rounded-full bg-destructive" />}
          {formatTime(elapsed)}
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl gap-0 lg:grid-cols-[300px_1fr]">
        <aside className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div className="space-y-5">
            <section>
              <h2 className="text-sm font-semibold">Dispositivos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Configure a fonte antes de gravar.</p>
            </section>
            <label className="block text-xs text-muted-foreground">
              Câmera
              <select
                value={cameraId}
                onChange={(event) => {
                  const value = event.target.value;
                  setCameraId(value);
                  void startPreview(value, microphoneId);
                }}
                disabled={status === "recording" || status === "paused"}
                className="mt-1.5 w-full rounded-md border border-border bg-card px-2 py-2 text-foreground"
              >
                {!cameras.length && <option value="">Câmera padrão</option>}
                {cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Microfone
              <select
                value={microphoneId}
                onChange={(event) => {
                  const value = event.target.value;
                  setMicrophoneId(value);
                  void startPreview(cameraId, value);
                }}
                disabled={status === "recording" || status === "paused"}
                className="mt-1.5 w-full rounded-md border border-border bg-card px-2 py-2 text-foreground"
              >
                {!microphones.length && <option value="">Microfone padrão</option>}
                {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={cameraEnabled ? "secondary" : "outline"} onClick={toggleCamera} disabled={status === "idle" || status === "review"}>
                {cameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />} Câmera
              </Button>
              <Button variant={microphoneEnabled ? "secondary" : "outline"} onClick={toggleMicrophone} disabled={status === "idle" || status === "review"}>
                <Mic className="size-4" /> Áudio
              </Button>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              A captura fica nesta sessão e abre direto no editor profissional para corte, legenda, estilo e publicação.
            </div>
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col items-center justify-center gap-5 p-5 lg:p-8">
          <div className="relative flex h-[min(68dvh,760px)] w-full max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
            {status === "review" && capture ? (
              <video ref={reviewVideoRef} src={capture.url} controls playsInline className="h-full w-full object-contain" />
            ) : (
              <video ref={liveVideoRef} muted playsInline className="h-full w-full object-contain" />
            )}
            {status === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card p-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"><Camera className="size-6" /></span>
                <div>
                  <p className="font-medium">Câmera ainda não iniciada</p>
                  <p className="mt-1 text-sm text-muted-foreground">Autorize os dispositivos para ver a prévia.</p>
                </div>
                <Button onClick={() => void startPreview()}>Abrir câmera e microfone</Button>
              </div>
            )}
          </div>

          <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
            {status === "ready" && <Button size="lg" onClick={startRecording}><span className="size-3 rounded-full bg-destructive" /> Gravar</Button>}
            {(status === "recording" || status === "paused") && (
              <>
                <Button variant="secondary" size="lg" onClick={pauseOrResume}>
                  {status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                  {status === "paused" ? "Retomar" : "Pausar"}
                </Button>
                <Button size="lg" onClick={finishRecording}><CircleStop className="size-4" /> Finalizar</Button>
              </>
            )}
            {status === "review" && (
              <>
                <Button variant="outline" size="lg" onClick={discard}><RefreshCcw className="size-4" /> Gravar novamente</Button>
                <Button size="lg" onClick={() => void openInEditor()} disabled={opening}>
                  <Video className="size-4" /> {opening ? "Criando projeto…" : "Abrir no editor profissional"}
                </Button>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}