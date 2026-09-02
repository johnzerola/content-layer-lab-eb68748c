import { useRef, useState } from "react";
import { FolderOpen, Link as LinkIcon, Upload, CheckCircle2, Info } from "lucide-react";
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/base";
import { VIDEO_ACCEPT } from "@/lib/media";
import { FLOWS, type Mode } from "@/lib/flows";

interface Props {
  mode: Mode;
  count: number;
  onFiles: (files: FileList | null) => void;
  linkUrl: string;
  onLinkUrl: (v: string) => void;
  linkBusy: boolean;
  linkMsg: string | null;
  linkBlocked: boolean;
  onImportLink: () => void;
}

/** Zona de importação — cada ferramenta tem o seu próprio fluxo de entrada. */
export function ImportPanel({
  mode,
  count,
  onFiles,
  linkUrl,
  onLinkUrl,
  linkBusy,
  linkMsg,
  linkBlocked,
  onImportLink,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState(false);
  const flow = FLOWS[mode].import;

  return (
    <section
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        setDropped(true);
        window.setTimeout(() => setDropped(false), 700);
        onFiles(e.dataTransfer.files);
      }}
      aria-label="Importar vídeos"
      className={`panel aurora rise-in relative overflow-hidden border-dashed p-0 transition-[border-color,background-color,box-shadow] duration-[var(--dur-base)] hover:border-[var(--border-hover)] ${
        dragging ? "aurora-on drop-active" : ""
      } ${dropped ? "aurora-sweep" : ""}`}
    >
      {/* cabeçalho / dropzone */}
      <div className="px-6 py-10 text-center sm:px-10">
        <div
          className={`mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--primary-subtle)] ring-1 ring-[var(--primary-subtle)] transition-transform duration-[var(--dur-base)] ${
            dragging ? "scale-110" : ""
          } ${count === 0 ? "pulse-ring" : ""}`}
        >
          <Upload
            className={`size-6 text-primary transition-transform duration-[var(--dur-base)] ${
              dragging ? "-translate-y-0.5" : ""
            }`}
          />
        </div>

        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">
          <span className="step-num mr-2 align-middle">{flow.step}</span>
          {dragging ? "Solte para importar os vídeos" : flow.title}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {flow.hint}
        </p>

        {count > 0 && (
          <p
            key={count}
            className="pop-in mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-subtle)] bg-[var(--primary-subtle)] px-3 py-1 text-xs font-medium text-primary"
          >
            <CheckCircle2 className="size-3.5" />
            {count} vídeo(s) na fila do {FLOWS[mode].brand}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" />
                {flow.filesLabel}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ou arraste e solte os arquivos aqui</TooltipContent>
          </Tooltip>
          {flow.folder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => folderRef.current?.click()}>
                  <FolderOpen className="size-4" />
                  Selecionar pasta
                </Button>
              </TooltipTrigger>
              <TooltipContent>Importa todos os vídeos da pasta de uma vez</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple={flow.multiple}
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {flow.folder && (
        <input
          ref={folderRef}
          type="file"
          multiple
          hidden
          // @ts-expect-error atributo não tipado
          webkitdirectory=""
          onChange={(e) => onFiles(e.target.files)}
        />
      )}

      {flow.link ? (
        <div className="border-t border-border bg-surface-2/40 px-6 py-6 text-left sm:px-10">
          <div className="mx-auto max-w-2xl">
            <p className="mono-label">ou cole o link do vídeo</p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <Input
                value={linkUrl}
                onChange={(e) => onLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onImportLink()}
                placeholder={flow.linkPlaceholder}
                className="flex-1 text-sm"
                aria-label="Link do vídeo"
              />
              <Button
                onClick={onImportLink}
                loading={linkBusy}
                disabled={!linkUrl.trim()}
                className="sm:w-36"
              >
                {!linkBusy && <LinkIcon className="size-4" />}
                {linkBusy ? "Baixando…" : "Importar"}
              </Button>
            </div>

            {linkBusy && (
              <p className="mt-2.5 flex items-center gap-1 text-xs text-primary">
                baixando o arquivo
                <span className="typing-dot">·</span>
                <span className="typing-dot [animation-delay:150ms]">·</span>
                <span className="typing-dot [animation-delay:300ms]">·</span>
              </p>
            )}

            <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {flow.linkHint} usa o arquivo original público disponibilizado pela plataforma,
                quando existente.
              </span>
            </p>

            {linkMsg && !linkBusy && (
              <p className="pop-in mt-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                {linkMsg}
              </p>
            )}

            {linkBlocked && (
              <div className="pop-in mt-3 rounded-xl border border-border bg-surface p-4">
                <p className="mono-label text-primary">como importar mesmo assim</p>
                <ol className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>1. confirme que o post é público e que você tem permissão para usar o vídeo</li>
                  <li>2. arraste o arquivo aqui em cima, ou use "{flow.filesLabel}"</li>
                  <li>3. links diretos de arquivo (.mp4, .mov, .webm, .mkv, .m4v...) importam normalmente</li>
                  <li>4. conteúdo privado, live, playlist ou protegido por DRM não pode ser importado</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-border bg-surface-2/40 px-6 py-5 text-left sm:px-10">
          <p className="mx-auto flex max-w-2xl items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              a limpeza roda no arquivo original: importe o vídeo já baixado para preservar a
              qualidade máxima.
              {linkMsg && <span className="mt-1.5 block">{linkMsg}</span>}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
