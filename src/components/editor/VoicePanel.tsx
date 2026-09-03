/**
 * PAINEL DE VOZ
 * Um lugar só para a locução: gravar a sua própria voz pelo microfone ou gerar
 * narração em pt-BR escolhendo voz, tom, velocidade e entonação (ênfase, pausas
 * e altura). Gera uma prévia antes de virar trilha do projeto.
 *
 * Só apresentação/edição de áudio do documento — não altera regras de negócio.
 */
import { useRef, useState } from "react";
import { Mic, Play, Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { createAudioClip, defaultEditorAudio, type AudioClip, type EditorAudio } from "@/lib/editor/audio";
import { NARRATION_VOICES, generateNarration } from "@/lib/tts.functions";

interface Props {
  audio: EditorAudio | undefined;
  onChange: (next: EditorAudio, label?: string) => void;
  scriptText?: string;
  currentTime: number;
}

const TONES: { id: string; label: string; prompt: string }[] = [
  { id: "viral", label: "Viral", prompt: "energia alta de vídeo curto, ritmo acelerado e ênfase nas primeiras palavras" },
  { id: "natural", label: "Natural", prompt: "tom natural e conversacional, como quem explica para um amigo" },
  { id: "documental", label: "Documental", prompt: "tom documental, pausado, grave e confiante" },
  { id: "suave", label: "Suave", prompt: "tom calmo, suave e acolhedor, com pausas confortáveis" },
  { id: "anuncio", label: "Anúncio", prompt: "locutor de anúncio, entusiasmado e persuasivo, destacando benefícios" },
  { id: "storytelling", label: "História", prompt: "narrativa de história, com suspense crescente e variação de intensidade" },
];

const PITCHES: { id: string; label: string; prompt: string }[] = [
  { id: "grave", label: "Grave", prompt: "voz mais grave e encorpada" },
  { id: "media", label: "Média", prompt: "altura de voz natural" },
  { id: "aguda", label: "Aguda", prompt: "voz mais aguda e leve" },
];

const MAX_INLINE_AUDIO = 20 * 1024 * 1024;

function toDataUrl(blob: Blob): Promise<string> {
  if (blob.size > MAX_INLINE_AUDIO) {
    return Promise.reject(new Error("Áudio muito grande para salvar no projeto (máx. 20 MB)."));
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o áudio."));
    fr.readAsDataURL(blob);
  });
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px]">{hint}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

export function VoicePanel({ audio, onChange, scriptText = "", currentTime }: Props) {
  const state = audio ?? defaultEditorAudio();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState(scriptText.slice(0, 800));
  const [voice, setVoice] = useState(NARRATION_VOICES[0]!.id);
  const [tone, setTone] = useState(TONES[0]!.id);
  const [pitch, setPitch] = useState("media");
  const [speed, setSpeed] = useState(1);
  const [emphasis, setEmphasis] = useState(0.5);
  const [pauses, setPauses] = useState(0.4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const addClip = (clip: AudioClip) =>
    onChange({ ...state, tracks: [...state.tracks, clip] }, "add-voz");

  /** Monta a instrução de entonação enviada ao gerador de voz. */
  function instructions(): string {
    const t = TONES.find((x) => x.id === tone)?.prompt ?? "";
    const p = PITCHES.find((x) => x.id === pitch)?.prompt ?? "";
    const emp =
      emphasis > 0.7
        ? "marque bastante as palavras-chave, com intensidade forte"
        : emphasis > 0.35
          ? "dê ênfase moderada nas palavras-chave"
          : "mantenha a intensidade uniforme, sem exageros";
    const pau =
      pauses > 0.7
        ? "use pausas longas entre as frases"
        : pauses > 0.3
          ? "use pausas curtas e naturais entre as frases"
          : "encadeie as frases quase sem pausa";
    return `Use ${t}. Voz com ${p}. Na entonação: ${emp} e ${pau}.`;
  }

  async function record() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        try {
          const url = await toDataUrl(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          setPreview({ url, name: "Minha voz" });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha ao salvar a gravação.");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone.");
    }
  }

  async function narrate() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const out = await generateNarration({
        data: { text: text.trim(), voice, speed, instructions: instructions().slice(0, 400) },
      });
      setPreview({ url: out.dataUrl, name: `Narração · ${voice}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar a narração.");
    } finally {
      setBusy(false);
    }
  }

  function useTake() {
    if (!preview) return;
    addClip(
      createAudioClip({
        kind: "voice",
        name: preview.name,
        url: preview.url,
        startTime: currentTime,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0.25,
      }),
    );
    setPreview(null);
  }

  const voiceTracks = state.tracks.filter((t) => t.kind === "voice");

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-border/60 p-3">
        <p className="mono-label">Minha voz</p>
        <button
          type="button"
          onClick={() => void record()}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording ? "Parar gravação" : "Gravar pelo microfone"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          A gravação entra na timeline no tempo atual e fica salva no projeto.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border/60 p-3">
        <p className="mono-label">Narração por IA (pt-BR)</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Escreva o que a voz deve falar…"
          className="w-full rounded-lg border border-border/60 bg-card/60 p-2 text-xs"
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-muted-foreground">Voz</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-card/60 px-2 py-1"
            >
              {NARRATION_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} · {v.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Tom</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-card/60 px-2 py-1"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Altura</span>
            <select
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-card/60 px-2 py-1"
            >
              {PITCHES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Slider
              label="Velocidade"
              value={speed}
              min={0.6}
              max={1.6}
              step={0.05}
              hint={`${speed.toFixed(2)}×`}
              onChange={setSpeed}
            />
          </div>
        </div>
        <Slider
          label="Ênfase"
          value={emphasis}
          min={0}
          max={1}
          step={0.05}
          hint={emphasis > 0.7 ? "forte" : emphasis > 0.35 ? "média" : "suave"}
          onChange={setEmphasis}
        />
        <Slider
          label="Pausas"
          value={pauses}
          min={0}
          max={1}
          step={0.05}
          hint={pauses > 0.7 ? "longas" : pauses > 0.3 ? "naturais" : "curtas"}
          onChange={setPauses}
        />
        <button
          type="button"
          onClick={() => void narrate()}
          disabled={busy || !text.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/50 px-3 py-2 text-sm font-medium text-primary disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Gerando voz…" : "Gerar prévia da narração"}
        </button>
      </section>

      {preview && (
        <section className="space-y-2 rounded-xl border border-primary/40 p-3">
          <p className="mono-label">Prévia · {preview.name}</p>
          <audio src={preview.url} controls className="w-full" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={useTake}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Usar na timeline
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg border border-border/60 px-3 py-1.5 text-xs"
            >
              Descartar
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <section className="space-y-2">
        <p className="mono-label">Trilhas de voz</p>
        {!voiceTracks.length && <p className="text-xs text-muted-foreground">Nenhuma trilha de voz ainda.</p>}
        {voiceTracks.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2 text-xs">
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{c.startTime.toFixed(1)}s</span>
            <button
              type="button"
              aria-label={`Remover ${c.name}`}
              onClick={() =>
                onChange({ ...state, tracks: state.tracks.filter((t) => t.id !== c.id) }, "remover-voz")
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
