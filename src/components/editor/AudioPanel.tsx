/** Mixagem: música de fundo, áudio original, gravação e narração por IA. */
import { useRef, useState } from "react";
import { Mic, Sparkles, Square, Trash2, Upload } from "lucide-react";
import {
  createAudioClip,
  defaultEditorAudio,
  type AudioClip,
  type EditorAudio,
} from "@/lib/editor/audio";

import { NARRATION_VOICES, generateNarration } from "@/lib/tts.functions";
import { SoundLibrary } from "@/components/editor/SoundLibrary";

const NARRATION_TONES: { id: string; label: string; prompt: string }[] = [
  { id: "viral", label: "Viral / energia alta", prompt: "Narre em português do Brasil com energia alta de vídeo curto, ritmo acelerado e ênfase nas primeiras palavras." },
  { id: "natural", label: "Natural / conversa", prompt: "Narre em português do Brasil de forma natural e conversacional, como se estivesse explicando para um amigo." },
  { id: "documental", label: "Documental / sério", prompt: "Narre em português do Brasil com tom documental, pausado, grave e confiante." },
  { id: "suave", label: "Suave / calmo", prompt: "Narre em português do Brasil com tom calmo, suave e acolhedor, com pausas confortáveis." },
  { id: "anuncio", label: "Anúncio / vendas", prompt: "Narre em português do Brasil como locutor de anúncio, entusiasmado e persuasivo, destacando os benefícios." },
];

interface Props {
  audio: EditorAudio | undefined;
  onChange: (next: EditorAudio, label?: string) => void;
  /** texto sugerido para narração (roteiro/transcrição) */
  scriptText?: string;
  currentTime: number;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-1 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </label>
  );
}

export function AudioPanel({ audio, onChange, scriptText = "", currentTime }: Props) {
  const state = audio ?? defaultEditorAudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState(scriptText.slice(0, 600));
  const [voice, setVoice] = useState(NARRATION_VOICES[0]!.id);
  const [tone, setTone] = useState(NARRATION_TONES[0]!.id);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<EditorAudio>, label = "audio") => onChange({ ...state, ...p }, label);
  const addClip = (clip: AudioClip) => patch({ tracks: [...state.tracks, clip] }, "add-audio");
  const updateClip = (id: string, p: Partial<AudioClip>) =>
    patch({ tracks: state.tracks.map((c) => (c.id === id ? { ...c, ...p } : c)) }, "audio-clip");
  const removeClip = (id: string) => patch({ tracks: state.tracks.filter((c) => c.id !== id) }, "remover-audio");

  async function record() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        addClip(
          createAudioClip({
            kind: "voice",
            name: "Narração gravada",
            url: URL.createObjectURL(blob),
            startTime: currentTime,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0.2,
          }),
        );
        setRecording(false);
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
      const instructions = NARRATION_TONES.find((t) => t.id === tone)?.prompt;
      const out = await generateNarration({
        data: { text: text.trim(), voice, speed, ...(instructions ? { instructions } : {}) },
      });
      addClip(
        createAudioClip({
          kind: "voice",
          name: `Narração IA · ${NARRATION_TONES.find((t) => t.id === tone)?.label ?? tone}`,
          url: out.dataUrl,
          startTime: currentTime,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0.2,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar narração.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-xl border border-border/60 p-2.5">
        <p className="mb-1 font-mono text-[11px] uppercase text-muted-foreground">Áudio original</p>
        <Row label="Silenciar">
          <input
            type="checkbox"
            checked={state.originalMuted}
            onChange={(e) => patch({ originalMuted: e.target.checked }, "mudo-original")}
          />
        </Row>
        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={state.originalVolume}
            onChange={(e) => patch({ originalVolume: Number(e.target.value) }, "vol-original")}
            className="min-w-0 flex-1"
          />
          <span className="w-10 text-right font-mono text-[11px]">{Math.round(state.originalVolume * 100)}%</span>
        </Row>
        <Row label="Ducking">
          <input
            type="checkbox"
            checked={state.duckUnderSpeech}
            onChange={(e) => patch({ duckUnderSpeech: e.target.checked }, "ducking")}
          />
          <span className="text-[11px] text-muted-foreground">abaixa a música sob a fala</span>
        </Row>
        {state.duckUnderSpeech && (
          <Row label="Intensidade">
            <input
              type="range"
              min={0.2}
              max={0.95}
              step={0.05}
              value={state.duckAmount}
              onChange={(e) => patch({ duckAmount: Number(e.target.value) }, "duck-amount")}
              className="min-w-0 flex-1"
            />
          </Row>
        )}
      </section>

      <section className="rounded-xl border border-border/60 p-2.5">
        <p className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">Música, efeitos e voz</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5" /> Enviar arquivo
          </button>
          <button
            type="button"
            onClick={record}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
              recording ? "border-destructive text-destructive" : "border-border/60"
            }`}
          >
            {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {recording ? "Parar" : "Gravar voz"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            addClip(createAudioClip({ kind: "music", name: f.name, url: URL.createObjectURL(f) }));
            e.target.value = "";
          }}
        />
        <div className="mt-2">
          <SoundLibrary
            onAdd={(asset) => {
              const isSfx = asset.kind === "sfx";
              const clip = createAudioClip({
                kind: isSfx ? "sfx" : "music",
                name: asset.name,
                url: asset.url,
                startTime: isSfx ? currentTime : 0,
                volume: isSfx ? 1 : 0.6,
                fadeIn: isSfx ? 0 : 0.5,
                fadeOut: isSfx ? 0 : 0.8,
                loop: !isSfx,
              });
              // música de fundo entra já com ducking sob a fala
              onChange(
                {
                  ...state,
                  tracks: [...state.tracks, clip],
                  duckUnderSpeech: isSfx ? state.duckUnderSpeech : true,
                },
                "add-audio",
              );
            }}
          />
        </div>

      </section>


      <section className="rounded-xl border border-border/60 p-2.5">
        <p className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">Narração por IA</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Texto que a voz vai narrar…"
          className="w-full rounded-lg border border-border/60 bg-card/60 p-2 text-xs"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            aria-label="Voz"
            className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs"
          >
            {NARRATION_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — {v.hint}
              </option>
            ))}
          </select>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            aria-label="Tom da narração"
            className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs"
          >
            {NARRATION_TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Row label="Velocidade">
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="w-10 text-right font-mono text-[11px]">{speed.toFixed(2)}x</span>
        </Row>
        <button
          type="button"
          onClick={() => void narrate()}
          disabled={busy || !text.trim()}
          className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> {busy ? "Gerando…" : "Gerar narração"}
        </button>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          A voz entra como clipe na trilha a partir do tempo atual ({currentTime.toFixed(1)}s).
        </p>
        {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
      </section>

      <section className="space-y-2">
        <p className="font-mono text-[11px] uppercase text-muted-foreground">Clipes de áudio ({state.tracks.length})</p>
        {!state.tracks.length && (
          <p className="text-xs text-muted-foreground">Nenhuma faixa ainda. Envie uma música ou grave sua voz.</p>
        )}
        {state.tracks.map((c) => (
          <div key={c.id} className="rounded-xl border border-border/60 p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs font-medium">{c.name}</span>
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{c.kind}</span>
              <button type="button" onClick={() => removeClip(c.id)} aria-label={`Remover ${c.name}`}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
            <audio src={c.url} controls className="mt-1.5 h-8 w-full" />
            <Row label="Início">
              <input
                type="number"
                min={0}
                step={0.1}
                value={c.startTime}
                onChange={(e) => updateClip(c.id, { startTime: Number(e.target.value) })}
                className="w-20 rounded border border-border/60 bg-card/60 px-1.5 py-0.5 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">s</span>
            </Row>
            <Row label="Volume">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={c.volume}
                onChange={(e) => updateClip(c.id, { volume: Number(e.target.value) })}
                className="min-w-0 flex-1"
              />
              <span className="w-10 text-right font-mono text-[11px]">{Math.round(c.volume * 100)}%</span>
            </Row>
            <Row label="Fade in">
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={c.fadeIn}
                onChange={(e) => updateClip(c.id, { fadeIn: Number(e.target.value) })}
                className="min-w-0 flex-1"
              />
              <span className="w-10 text-right font-mono text-[11px]">{c.fadeIn.toFixed(1)}s</span>
            </Row>
            <Row label="Fade out">
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={c.fadeOut}
                onChange={(e) => updateClip(c.id, { fadeOut: Number(e.target.value) })}
                className="min-w-0 flex-1"
              />
              <span className="w-10 text-right font-mono text-[11px]">{c.fadeOut.toFixed(1)}s</span>
            </Row>
            <Row label="Em loop">
              <input type="checkbox" checked={c.loop} onChange={(e) => updateClip(c.id, { loop: e.target.checked })} />
            </Row>
          </div>
        ))}
      </section>
    </div>
  );
}
