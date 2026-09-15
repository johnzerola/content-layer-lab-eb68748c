import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Loader2,
  MessageCircle,
  Mic,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/base";
import { DEFAULT_BRIEF, STORY_TONES, type StoryBrief } from "@/lib/chatscene/story";
import type { CreatorFormat } from "@/lib/chatscene/creator-presets";
import { RedditStoryPanel } from "./RedditStoryPanel";
import type { RedditStoryDraft } from "@/lib/chatscene/reddit-story";

export interface StoryPanelProps {
  busy: boolean;
  format: CreatorFormat;
  onGenerate: (brief: StoryBrief, withVoices: boolean) => void;
  onImportReddit: (draft: RedditStoryDraft) => void;
  onExample: () => void;
  onReferenceStyle: () => void;
}
const STARTERS = [
  {
    label: "Segredo de família",
    tag: "DRAMA",
    tone: "drama" as const,
    topic:
      "Uma filha encontra uma chave escondida e questiona a mãe no WhatsApp. A mãe tenta mudar de assunto. A chave abre uma caixa com cartas que explicam uma antiga briga da família. Termine com uma reconciliação concreta, sem narrador.",
  },
  {
    label: "Mensagem errada",
    tag: "COMÉDIA",
    tone: "comedia" as const,
    topic:
      "Um funcionário manda uma reclamação sobre o chefe para o próprio chefe. Ele tenta consertar a situação com uma desculpa cada vez pior. O chefe percebe e responde com humor. A virada final retoma uma palavra da primeira mensagem.",
  },
  {
    label: "Quem está na porta?",
    tag: "SUSPENSE",
    tone: "suspense" as const,
    topic:
      "Duas amigas conversam pelo WhatsApp. Uma recebe uma entrega que não pediu e a outra reconhece o remetente. Revele pistas pelas respostas curtas e termine explicando a entrega de um jeito surpreendente, mas coerente.",
  },
];

export function StoryPanel({
  busy,
  format,
  onGenerate,
  onImportReddit,
  onExample,
  onReferenceStyle,
}: StoryPanelProps) {
  const [brief, setBrief] = useState<StoryBrief>(DEFAULT_BRIEF);
  const [withVoices, setWithVoices] = useState(false);
  const set = (changes: Partial<StoryBrief>) => setBrief((prev) => ({ ...prev, ...changes }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">01 / CRIE O ROTEIRO</p>
          <h2 className="text-xl font-bold tracking-tight">
            {format === "whatsapp"
              ? "Uma ideia. Uma conversa que prende."
              : "Sua história merece ser ouvida."}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {format === "whatsapp"
              ? "Descreva o conflito. A IA organiza personagens, respostas e uma virada para o final."
              : "Cole um relato e transforme cada trecho em uma cena narrada."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onExample} disabled={busy}>
          <Clapperboard className="size-4" />
          Experimentar exemplo
        </Button>
      </div>
      <div hidden={format !== "reddit"}>
        <RedditStoryPanel busy={busy} onImport={onImportReddit} />
      </div>
      <div hidden={format !== "whatsapp"} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Ideias de conversa">
          {STARTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => set({ topic: item.topic, tone: item.tone })}
              disabled={busy}
              className="rounded-xl border border-border bg-background/40 p-3 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">
                {item.tag}
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold">
                {item.label}
                <ArrowRight className="size-3.5 shrink-0" />
              </span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-background/60 focus-within:border-primary">
          <label
            htmlFor="chatscene-story-prompt"
            className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold"
          >
            <Sparkles className="size-4 text-primary" />O que acontece na sua história?
          </label>
          <textarea
            id="chatscene-story-prompt"
            aria-label="Tema da história"
            value={brief.topic}
            onChange={(e) => set({ topic: e.target.value })}
            rows={5}
            maxLength={400}
            placeholder="Quem está conversando? Qual é o segredo, problema ou surpresa? Como você quer que termine?"
            className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
            <span>Conflito + personagens + virada</span>
            <span>{brief.topic.length}/400</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold">Clima da conversa</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tom da história">
            {STORY_TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                aria-pressed={brief.tone === tone.id}
                title={tone.hint}
                onClick={() => set({ tone: tone.id })}
                className={`rounded-lg border px-3 py-2 text-xs transition focus-visible:ring-2 focus-visible:ring-ring ${brief.tone === tone.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
              >
                {brief.tone === tone.id && <Check className="mr-1 inline size-3" />}
                {tone.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold">
            <span className="flex justify-between">
              Duração desejada <span className="text-muted-foreground">{brief.durationSec}s</span>
            </span>
            <input
              type="range"
              aria-label="Duração da história em segundos"
              min={20}
              max={180}
              step={10}
              value={brief.durationSec}
              onChange={(e) => set({ durationSec: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <span className="block font-normal text-muted-foreground">
              O tempo final acompanha as falas geradas.
            </span>
          </label>
          <label className="space-y-2 text-xs font-semibold">
            <span className="flex justify-between">
              Elenco <span className="text-muted-foreground">{brief.characters} personagens</span>
            </span>
            <input
              type="range"
              aria-label="Quantidade de personagens"
              min={2}
              max={6}
              value={brief.characters}
              onChange={(e) => set({ characters: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <span className="block font-normal text-muted-foreground">
              Cada personagem recebe uma identidade vocal.
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="size-4 text-emerald-300" />
              Visual de conversa para Shorts
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Balões escuros, páginas rápidas e espaço para o fundo.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReferenceStyle} disabled={busy}>
            Aplicar visual
          </Button>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={withVoices}
            onChange={(e) => setWithVoices(e.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="size-4" />
              Gerar as vozes junto com o roteiro
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Deixe desmarcado para revisar as falas primeiro e evitar gerar áudio que você ainda
              vai editar.
            </span>
          </span>
        </label>
        <Button
          disabled={busy || brief.topic.trim().length < 3}
          onClick={() => onGenerate(brief, withVoices)}
          className="h-11 w-full text-sm"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {busy
            ? "Preparando sua história…"
            : withVoices
              ? "Criar conversa e gerar vozes"
              : "Criar conversa para revisar"}
          <ArrowRight className="size-4" />
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Gera um roteiro original e substitui a conversa atual. Você pode editar cada fala ou
          desfazer a troca.
        </p>
      </div>
    </div>
  );
}
