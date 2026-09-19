import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Loader2,
  MessageCircle,
  Mic,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/base";
import { DEFAULT_BRIEF, STORY_TONES, type StoryBrief } from "@/lib/chatscene/story";
import {
  STORY_TOPIC_MAX_CHARS,
  type StoryNarrativeStyle,
  type StorySourceTreatment,
} from "@/lib/chatscene/story-style";
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
    label: "Três gerações no grupo",
    tag: "Família",
    characters: 3,
    tone: "comedia" as const,
    topic:
      "No grupo da família, um filho descobre que a avó vendeu seu videogame. A mãe tenta entender, o menino exige de volta e a avó manda o comprovante: ela vendeu apenas a caixa vazia que ele guardava. Revele a confusão aos poucos, com reações curtas e uma consequência engraçada. Elenco de criança, adulto e avó, com vozes sintéticas distintas.",
  },
  {
    label: "Mensagem errada",
    tag: "Comédia",
    characters: 2,
    tone: "comedia" as const,
    topic:
      "Um funcionário manda uma reclamação sobre o chefe para o próprio chefe. Ele tenta consertar a situação com uma desculpa cada vez pior. O chefe percebe e responde com humor. A virada final retoma uma palavra da primeira mensagem.",
  },
  {
    label: "Quem está na porta?",
    tag: "Suspense",
    characters: 2,
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
    <div className="space-y-6" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">01 / Crie o roteiro</p>
          <h2 className="text-xl font-bold tracking-tight">
            {format === "whatsapp"
              ? "Uma ideia. Uma conversa que prende."
              : "Sua história merece ser ouvida."}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {format === "whatsapp"
              ? "Comece pelo conflito. Receba um gancho direto, réplicas com personalidade e uma virada que faz o começo ganhar outro sentido."
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
              onClick={() =>
                set({ topic: item.topic, tone: item.tone, characters: item.characters })
              }
              disabled={busy}
              className="rounded-xl border border-border bg-background/40 p-3 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="text-xs font-medium text-muted-foreground">{item.tag}</span>
              <span className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold">
                {item.label}
                <ArrowRight className="size-3.5 shrink-0" />
              </span>
            </button>
          ))}
        </div>
        <section aria-label="Direção do roteiro" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="story-narrative-style" className="text-sm font-semibold">
              Jeito de contar
            </label>
            <select
              id="story-narrative-style"
              value={brief.narrativeStyle ?? "animated-chat"}
              onChange={(event) =>
                set({ narrativeStyle: event.target.value as StoryNarrativeStyle })
              }
              disabled={busy}
              className="min-h-12 max-w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="animated-chat">Conversa animada · recomendado</option>
              <option value="free">Livre · seguir minha ideia</option>
            </select>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {brief.narrativeStyle === "free"
              ? "Sua ideia define a estrutura, o humor e o final da conversa."
              : "Humor de situação, choque de personalidades e pequenas revelações até a virada. Já vem aplicado ao próximo roteiro."}
          </p>
          {brief.narrativeStyle !== "free" && (
            <details className="group text-xs text-muted-foreground">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-md font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Como a história prende a atenção
                <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden />
              </summary>
              <ol className="list-decimal space-y-2 pl-5 pb-2 leading-relaxed">
                <li>Um problema concreto na primeira mensagem.</li>
                <li>Réplicas curtas e tentativas que complicam a situação.</li>
                <li>Uma pista antecipada prepara a revelação.</li>
                <li>O final resolve o conflito e retoma um detalhe do começo.</li>
              </ol>
            </details>
          )}
        </section>
        <section aria-label="Originalidade da referência" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="story-source-treatment" className="text-sm font-semibold">
              O que fazer com uma transcrição?
            </label>
            <select
              id="story-source-treatment"
              value={brief.sourceTreatment ?? "reinvent"}
              onChange={(event) =>
                set({ sourceTreatment: event.target.value as StorySourceTreatment })
              }
              disabled={busy}
              className="min-h-12 max-w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="reinvent">Reinventar tudo · recomendado</option>
              <option value="preserve-premise">Preservar só a premissa</option>
            </select>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {brief.sourceTreatment === "preserve-premise"
              ? "Mantém apenas a ideia central ou os personagens indicados. A sequência, as falas, as pistas e a virada são novas."
              : "Usa a transcrição apenas para entender o DNA do gancho e do ritmo. Troca conflito, acontecimentos, personagens, pistas, falas e final para criar outra história."}
          </p>
        </section>
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
            aria-describedby="story-brief-help story-brief-count"
            value={brief.topic}
            onChange={(e) => set({ topic: e.target.value })}
            rows={8}
            maxLength={STORY_TOPIC_MAX_CHARS}
            disabled={busy}
            placeholder="Conte a situação, quem está conversando e o que cada pessoa quer. Pode detalhar o segredo, as pistas, o tipo de humor e o final que imaginou."
            className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span id="story-brief-help">Ideia, personagens, detalhes e final desejado</span>
            <span id="story-brief-count" className="tabular-nums">
              {brief.topic.length.toLocaleString("pt-BR")} /{" "}
              {STORY_TOPIC_MAX_CHARS.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        {brief.topic.length >= STORY_TOPIC_MAX_CHARS && (
          <p role="status" className="text-xs text-muted-foreground">
            Limite de 5.000 caracteres atingido. Resuma um detalhe para acrescentar outro.
          </p>
        )}
        <div className="space-y-2">
          <p className="text-xs font-semibold">Clima da conversa</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tom da história">
            {STORY_TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                aria-pressed={brief.tone === tone.id}
                title={tone.hint}
                disabled={busy}
                onClick={() => set({ tone: tone.id })}
                className={`min-h-12 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${brief.tone === tone.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
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
              disabled={busy}
              onChange={(e) => set({ durationSec: Number(e.target.value) })}
              className="min-h-12 w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              disabled={busy}
              onChange={(e) => set({ characters: Number(e.target.value) })}
              className="min-h-12 w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              Preset de conversa rápida
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Painel no alto, páginas automáticas e sons só nos cortes. Com voz pronta, o ritmo
              segue a duração real do áudio.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReferenceStyle} disabled={busy}>
            Aplicar visual e ritmo
          </Button>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={withVoices}
            disabled={busy}
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
          className="min-h-12 w-full text-sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Wand2 className="size-4" />
          )}
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
