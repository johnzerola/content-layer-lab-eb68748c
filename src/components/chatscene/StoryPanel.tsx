/**
 * Modo simples: descreva a história e a IA monta a conversa inteira
 * (personagens, vozes, jeito de escrever, cortes de cena e ritmo).
 */
import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/base";
import { DEFAULT_BRIEF, STORY_TONES, type StoryBrief } from "@/lib/chatscene/story";

export interface StoryPanelProps {
  busy: boolean;
  onGenerate: (brief: StoryBrief) => void;
}

const EXAMPLES = [
  "Meu chefe descobriu que eu menti sobre o motivo da falta",
  "Minha mãe entrou no grupo da família e leu tudo o que eu escrevi",
  "Um vizinho manda mensagem achando que sou outra pessoa",
];

export function StoryPanel({ busy, onGenerate }: StoryPanelProps) {
  const [brief, setBrief] = useState<StoryBrief>(DEFAULT_BRIEF);
  const set = (changes: Partial<StoryBrief>) => setBrief((prev) => ({ ...prev, ...changes }));

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <p className="mono-label mb-1 text-muted-foreground">Sobre o que é a história?</p>
        <textarea
          value={brief.topic}
          onChange={(e) => set({ topic: e.target.value })}
          rows={3}
          maxLength={400}
          placeholder="Ex.: meu sobrinho invadiu minha casa e quase me fez perder o emprego"
          aria-label="Tema da história"
          className="w-full rounded-lg border border-border bg-background/60 px-2.5 py-2 outline-none focus:border-primary"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => set({ topic: example })}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mono-label mb-1 text-muted-foreground">Tom</p>
        <div className="flex flex-wrap gap-1.5">
          {STORY_TONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => set({ tone: tone.id })}
              aria-pressed={brief.tone === tone.id}
              title={tone.hint}
              className={`rounded-lg border px-2.5 py-1 transition ${
                brief.tone === tone.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {tone.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center justify-between text-muted-foreground">
            Duração
            <span className="mono-label">{brief.durationSec}s</span>
          </label>
          <input
            type="range"
            min={20}
            max={180}
            step={10}
            value={brief.durationSec}
            onChange={(e) => set({ durationSec: Number(e.target.value) })}
            aria-label="Duração da história em segundos"
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-muted-foreground">
            Personagens
            <span className="mono-label">{brief.characters}</span>
          </label>
          <input
            type="range"
            min={2}
            max={6}
            step={1}
            value={brief.characters}
            onChange={(e) => set({ characters: Number(e.target.value) })}
            aria-label="Quantidade de personagens"
            className="w-full"
          />
        </div>
      </div>

      <Button
        type="button"
        disabled={busy || brief.topic.trim().length < 3}
        onClick={() => onGenerate(brief)}
        className="w-full"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {busy ? "Criando história e vozes…" : "Criar história completa com vozes"}
      </Button>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Cria roteiro, personagens com identidade vocal própria e falas reais em português brasileiro. Substitui a
        conversa atual, mas dá para desfazer com Ctrl+Z.
      </p>
    </div>
  );
}
