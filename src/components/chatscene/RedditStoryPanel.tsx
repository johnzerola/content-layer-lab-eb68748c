import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/base";
import { prepareRedditStory, type RedditStoryDraft } from "@/lib/chatscene/reddit-story";

const EMPTY: RedditStoryDraft = { title: "", body: "", author: "", community: "", sourceUrl: "" };
const FIELD = "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function RedditStoryPanel({ busy, onImport }: { busy: boolean; onImport: (draft: RedditStoryDraft) => void }) {
  const [draft, setDraft] = useState(EMPTY);
  const [reviewing, setReviewing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reviewControl = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const wasReviewing = useRef(false);
  useEffect(() => {
    if (reviewing) reviewControl.current?.focus();
    else if (wasReviewing.current) titleInput.current?.focus();
    wasReviewing.current = reviewing;
  }, [reviewing]);
  const result = useMemo(() => {
    try { return { prepared: prepareRedditStory(draft), error: "" }; }
    catch (error) { return { prepared: null, error: error instanceof Error ? error.message : "Revise a história." }; }
  }, [draft]);
  const set = (key: keyof RedditStoryDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setReviewing(false);
    setSubmitted(false);
  };
  return (
    <section aria-label="Histórias do Reddit" className="space-y-4 text-sm">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
        <h3 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-primary" /> Uma história, uma voz</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Cole o relato, revise os trechos e leve para a timeline. Depois escolha a voz do narrador e o vídeo de fundo.</p>
      </div>
      {!reviewing ? (
        <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (result.prepared) setReviewing(true); }} className="space-y-3">
          <label className="block space-y-1"><span>Título da história</span><input ref={titleInput} className={FIELD} value={draft.title} maxLength={160} onChange={(e) => set("title", e.target.value)} placeholder="O bilhete que mudou minha viagem" /></label>
          <label className="block space-y-1"><span>Texto da história</span><textarea className={`${FIELD} min-h-44 resize-y`} rows={8} value={draft.body} maxLength={20000} onChange={(e) => set("body", e.target.value)} placeholder="Cole um relato seu ou que você tenha permissão para usar…" /></label>
          <p className="text-right text-xs text-muted-foreground">{draft.body.length.toLocaleString("pt-BR")} / 20.000 caracteres</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1"><span>Autor <small className="text-muted-foreground">(opcional)</small></span><input className={FIELD} value={draft.author} maxLength={60} onChange={(e) => set("author", e.target.value)} placeholder="u/autor" /></label>
            <label className="block space-y-1"><span>Comunidade <small className="text-muted-foreground">(opcional)</small></span><input className={FIELD} value={draft.community} maxLength={80} onChange={(e) => set("community", e.target.value)} placeholder="r/comunidade" /></label>
          </div>
          <label className="block space-y-1"><span>Link do post <small className="text-muted-foreground">(opcional)</small></span><input className={FIELD} type="url" value={draft.sourceUrl} maxLength={2000} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://www.reddit.com/r/…/comments/…" /></label>
          <p className="text-xs text-muted-foreground">O link registra a fonte. Nesta versão, o texto é colado por você.</p>
          {submitted && result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
          <Button type="submit" disabled={busy} className="w-full"><Check className="size-4" />Revisar blocos</Button>
        </form>
      ) : result.prepared && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button ref={reviewControl} type="button" variant="outline" onClick={() => setReviewing(false)}><ArrowLeft className="size-3.5" />Editar texto</Button>
            <span className="text-xs text-muted-foreground">{result.prepared.blocks.length} blocos · fala estimada {result.prepared.estimatedSpeechSeconds}s</span>
          </div>
          <ol aria-label="Blocos da história" className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
            {result.prepared.blocks.map((block, index) => <li key={index} className="flex gap-3 border-b border-border/50 pb-2 last:border-0"><span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><p className="min-w-0 break-words text-sm leading-relaxed">{block}</p></li>)}
          </ol>
          <p className="text-xs leading-relaxed text-muted-foreground">O título e todos os blocos serão adicionados ao fim do roteiro com um narrador. Você poderá editar cada trecho e desfazer a importação.</p>
          <Button type="button" disabled={busy} className="w-full" onClick={() => onImport(draft)}><Plus className="size-4" />Adicionar história ao roteiro</Button>
          <p className="text-xs text-muted-foreground">Para ouvir: abra Vozes e gere as falas. A duração final depende do áudio gerado.</p>
        </div>
      )}
    </section>
  );
}
