/** Painel de transcrição: editar o vídeo editando o texto. */
import { memo, useMemo, useState } from "react";
import {
  applyBlockText,
  editWord,
  fillerWords,
  findReplace,
  keptDuration,
  removeWords,
  removedRanges,
  restoreWords,
  silenceRanges,
  transcriptBlocks,
  type TranscriptDoc,
  type TranscriptWord,
} from "@/lib/editor/transcript";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  doc: TranscriptDoc;
  onChange: (next: TranscriptDoc, label?: string) => void;
  currentTime: number;
  onSeek: (time: number) => void;
  cutOnRemove: boolean;
  onCutOnRemoveChange: (value: boolean) => void;
  onGenerate?: (() => void) | undefined;
  generating?: boolean | undefined;
  generateProgress?: string | undefined;
  hasMedia?: boolean | undefined;
  /** traduz para português e pontua a transcrição já existente */
  onRefine?: (() => void) | undefined;
}

const WordChip = memo(function WordChip({
  word,
  active,
  onSeek,
  onRemove,
  onEdit,
}: {
  word: TranscriptWord;
  active: boolean;
  onSeek: () => void;
  onRemove: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={word.word}
        aria-label="Editar palavra"
        className="mr-1 w-24 rounded-md border border-primary/60 bg-background px-1 text-sm"
        onBlur={(e) => {
          onEdit(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onEdit((e.target as HTMLInputElement).value);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onSeek}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={(e) => {
        e.preventDefault();
        onRemove();
      }}
      title={`${fmt(word.start)} · duplo clique para corrigir · botão direito remove`}
      className={[
        "mr-1 mb-1 rounded-md px-1 text-sm transition-colors",
        word.removed ? "text-muted-foreground line-through opacity-60" : "hover:bg-primary/15",
        active ? "bg-primary/25 text-foreground" : "",
      ].join(" ")}
    >
      {word.word}
    </button>
  );
});

export function TranscriptPanel({
  doc,
  onChange,
  currentTime,
  onSeek,
  cutOnRemove,
  onCutOnRemoveChange,
  onGenerate,
  generating = false,
  generateProgress,
  hasMedia = false,
  onRefine,
}: Props) {
  const [mode, setMode] = useState<"paragrafo" | "palavra">("paragrafo");
  const [search, setSearch] = useState("");
  const [hitIndex, setHitIndex] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const blocks = useMemo(() => transcriptBlocks(doc), [doc]);
  const removed = useMemo(() => removedRanges(doc), [doc]);
  const finalDuration = useMemo(() => keptDuration(doc.duration, removed), [doc.duration, removed]);
  const silences = useMemo(() => silenceRanges(doc), [doc]);
  const fillers = useMemo(() => fillerWords(doc), [doc]);
  const liveWords = doc.words.filter((w) => !w.removed).length;

  /** palavras que casam com a busca — usadas para navegar e destacar. */
  const hits = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [] as TranscriptWord[];
    return doc.words.filter((w) => w.word.toLowerCase().includes(term));
  }, [doc.words, search]);

  const applyRemoval = (ids: string[], label: string) => {
    if (!ids.length) return;
    onChange(removeWords(doc, ids), label);
    setNotice(cutOnRemove ? "Trecho removido da timeline." : "Palavra removida apenas da legenda.");
  };

  const gotoHit = (delta: number) => {
    if (!hits.length) return;
    const next = (hitIndex + delta + hits.length) % hits.length;
    setHitIndex(next);
    onSeek(hits[next]!.start);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{liveWords} palavras</span>
        <span className="font-mono">· final {fmt(finalDuration)}</span>
        <div className="ml-auto flex rounded-lg border border-border/60 p-0.5">
          {(["paragrafo", "palavra"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 text-xs capitalize ${mode === m ? "bg-primary/20 text-foreground" : ""}`}
            >
              {m === "paragrafo" ? "Parágrafo" : "Palavra"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHitIndex(0);
          }}
          placeholder="Buscar no roteiro..."
          aria-label="Buscar no roteiro"
          className="min-w-0 flex-1 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
        <span className="w-14 text-right font-mono text-[11px] text-muted-foreground">
          {hits.length ? `${hitIndex + 1}/${hits.length}` : "0/0"}
        </span>
        <button
          type="button"
          onClick={() => gotoHit(-1)}
          aria-label="Ocorrência anterior"
          className="rounded-md border border-border/60 px-2 py-1 text-xs"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => gotoHit(1)}
          aria-label="Próxima ocorrência"
          className="rounded-md border border-border/60 px-2 py-1 text-xs"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => applyRemoval(hits.map((w) => w.id), "remover-busca")}
          disabled={!hits.length}
          className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-40"
        >
          Cortar todas
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="De..."
          aria-label="Localizar"
          className="min-w-0 flex-1 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
        <span aria-hidden>→</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Para..."
          aria-label="Substituir por"
          className="min-w-0 flex-1 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          onClick={() => {
            const { doc: next, replaced } = findReplace(doc, from, to);
            if (replaced) onChange(next, "substituir");
            setNotice(replaced ? `${replaced} ocorrência(s) substituída(s).` : "Nada encontrado.");
          }}
        >
          Substituir
        </button>
      </div>


      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cutOnRemove} onChange={(e) => onCutOnRemoveChange(e.target.checked)} />
        Cortar vídeo ao remover palavra
      </label>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="rounded-lg border border-border/60 px-2 py-1"
          onClick={() => {
            const ids = fillers.map((w) => w.id);
            applyRemoval(ids, "remover-fillers");
          }}
        >
          Remover {fillers.length} palavras de preenchimento
        </button>
        <span className="rounded-lg border border-border/60 px-2 py-1 text-muted-foreground">
          {silences.reduce((s, r) => s + (r.end - r.start), 0).toFixed(1)}s de silêncio detectados
        </span>
        {doc.words.some((w) => w.removed) && (
          <button
            type="button"
            className="rounded-lg border border-border/60 px-2 py-1"
            onClick={() => onChange(restoreWords(doc, doc.words.filter((w) => w.removed).map((w) => w.id)), "restaurar")}
          >
            Restaurar cortes
          </button>
        )}
      </div>

      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card/40 p-3">
        {!doc.words.length && (
          <div className="flex min-h-44 flex-col items-center justify-center px-3 text-center">
            <p className="text-sm font-medium text-foreground">Transforme a fala em roteiro editável</p>
            <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted-foreground">
              A transcrição permite buscar, substituir e cortar o vídeo palavra por palavra.
            </p>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!hasMedia || generating || !onGenerate}
              className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
            >
              {generating ? generateProgress || "Transcrevendo…" : "Gerar transcrição"}
            </button>
            {!hasMedia && <p className="mt-2 text-[11px] text-muted-foreground">Carregue um vídeo primeiro.</p>}
          </div>
        )}

        {mode === "palavra"
          ? doc.words.map((w) => (
              <WordChip
                key={w.id}
                word={w}
                active={currentTime >= w.start && currentTime < w.end}
                onSeek={() => onSeek(w.start)}
                onRemove={() => applyRemoval([w.id], "remover-palavra")}
                onEdit={(text) => onChange(editWord(doc, w.id, text), "editar-palavra")}
              />
            ))
          : blocks.map((block) => (
              <BlockRow
                key={block.id}
                id={block.id}
                start={block.start}
                text={block.text}
                active={currentTime >= block.start && currentTime <= block.end}
                onSeek={() => onSeek(block.start)}
                onRemove={() => applyRemoval(block.words.map((w) => w.id), "remover-bloco")}
                onSave={(text) => onChange(applyBlockText(doc, block.id, text), "editar-bloco")}
              />
            ))}
      </div>
    </div>
  );
}

function BlockRow({
  id,
  start,
  text,
  active,
  onSeek,
  onSave,
  onRemove,
}: {
  id: string;
  start: number;
  text: string;
  active: boolean;
  onSeek: () => void;
  onSave: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`group mb-2 flex gap-2 rounded-lg p-1.5 ${active ? "bg-primary/10" : ""}`}>
      <button type="button" onClick={onSeek} className="mt-0.5 font-mono text-[11px] text-muted-foreground">
        {fmt(start)}
      </button>
      {editing ? (
        <textarea
          autoFocus
          defaultValue={text}
          aria-label={`Editar trecho ${id}`}
          className="min-h-16 flex-1 rounded-md border border-primary/60 bg-background p-2 text-sm"
          onBlur={(e) => {
            onSave(e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSave((e.target as HTMLTextAreaElement).value);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <p className="flex-1 cursor-text text-sm leading-relaxed" onDoubleClick={() => setEditing(true)}>
          {text}
        </p>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Remover trecho"
        className="opacity-0 transition-opacity group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
