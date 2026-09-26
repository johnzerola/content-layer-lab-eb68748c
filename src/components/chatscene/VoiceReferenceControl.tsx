import { useCallback, useEffect, useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/base";
import {
  listVoiceReferences,
  uploadVoiceReference,
  removeVoiceReference,
  type SavedVoiceReference,
} from "@/lib/chatscene/voice.functions";
import type { VoiceProfile } from "@/lib/chatscene/voice";
import { chatSceneClientError } from "@/lib/chatscene/client-error";

type Reference = NonNullable<VoiceProfile["reference"]>;
type ImportProgress = { done: number; total: number; current: string; failed: string[] };

export function VoiceReferenceControl({
  participantName,
  reference,
  available,
  onAttach,
  onRemove,
  open = false,
  title,
}: {
  participantName: string;
  reference: Reference | undefined;
  available: boolean | null;
  onAttach: (reference: Reference) => void;
  onRemove: () => void;
  open?: boolean;
  title?: string;
}) {
  const inputId = useId();
  const upload = useServerFn(uploadVoiceReference);
  const remove = useServerFn(removeVoiceReference);
  const list = useServerFn(listVoiceReferences);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedVoiceReference[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const loadSaved = useCallback(async () => {
    try {
      setSaved(await list());
    } catch (cause) {
      setError(chatSceneClientError(cause, "Não foi possível carregar suas vozes privadas."));
    } finally {
      setLoadingSaved(false);
    }
  }, [list]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const send = async (files: File[]) => {
    if (!authorized || busy || !files.length) return;
    setError(null);
    setProgress(null);
    if (files.length > 20) {
      setError("Importe no máximo 20 vozes por vez.");
      return;
    }
    const oversized = files.find((file) => file.size > 12 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} ultrapassa o limite de 12 MB.`);
      return;
    }

    setBusy(true);
    const failed: string[] = [];
    let firstImported: Reference | null = null;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        setProgress({ done: index, total: files.length, current: file.name, failed: [...failed] });
        try {
          const audio = await new Promise<string>((accept, reject) => {
            const reader = new FileReader();
            reader.onload = () => accept(String(reader.result).split(",")[1]!);
            reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
            reader.readAsDataURL(file);
          });
          const name = file.name.replace(/\.[^.]+$/, "").slice(0, 100);
          const result = await upload({ data: { audio, authorized: true, name } });
          firstImported ??= { ...result, name };
        } catch {
          failed.push(file.name);
        }
      }
      if (firstImported) onAttach(firstImported);
      await loadSaved();
      setProgress({ done: files.length, total: files.length, current: "", failed: [...failed] });
      if (failed.length) {
        setError(
          `${files.length - failed.length} vozes importadas; ${failed.length} falharam: ${failed.join(", ")}`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    if (!reference || busy) return;
    setBusy(true);
    setError(null);
    try {
      await remove({ data: { id: reference.id } });
      onRemove();
      await loadSaved();
    } catch (cause) {
      setError(chatSceneClientError(cause, "Falha ao excluir a referência."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details open={open} className="mt-3 border-t border-border pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-sm text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title ?? (reference ? "Voz clonada do personagem" : "Clonar voz a partir de um áudio")}
      </summary>
      <div className="space-y-3 pb-2 pt-1">
        <p className="text-xs text-muted-foreground">
          Importe áudios de 3 a 30 segundos, com fala limpa e sem música. Cada arquivo vira uma voz
          reutilizável e privada desta conta.
        </p>

        {loadingSaved ? (
          <p role="status" className="text-xs text-muted-foreground">
            Carregando suas vozes…
          </p>
        ) : saved.length ? (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-xs font-semibold">Minhas vozes · {saved.length}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {saved.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy || available !== true}
                  aria-pressed={reference?.id === item.id}
                  onClick={() =>
                    onAttach({ id: item.id, name: item.name, durationSec: item.durationSec })
                  }
                  className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${reference?.id === item.id ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"}`}
                >
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.durationSec.toFixed(1)} s</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Sua biblioteca ainda está vazia. Selecione os arquivos abaixo para começar.
          </p>
        )}

        {reference ? (
          <div className="space-y-2">
            <p className="break-words text-xs" role="status">
              Voz aplicada a {participantName}: {reference.name} ·{" "}
              {reference.durationSec.toFixed(1)} s
            </p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={busy}
              onClick={() => void erase()}
            >
              Excluir referência e usar voz sintética
            </Button>
          </div>
        ) : null}

        <div className="rounded-lg border border-dashed border-border bg-background/45 p-3">
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            Estas vozes são minhas ou tenho autorização escrita das pessoas adultas para usá-las.
          </label>
          <label htmlFor={inputId} className="mt-2 block text-xs font-medium">
            Importar uma ou várias vozes
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Selecione até 20 arquivos. Formatos: MP3, WAV, M4A, OGG e FLAC; até 12 MB cada.
          </p>
          <input
            id={inputId}
            type="file"
            multiple
            accept="audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,.wav,.mp3,.m4a,.ogg,.flac"
            disabled={!authorized || busy || available !== true}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void send(files);
              event.target.value = "";
            }}
            className="mt-2 block min-h-11 w-full min-w-0 rounded-md border border-border p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {busy ? (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs"
          >
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Importando {progress ? progress.done + 1 : 1} de {progress?.total ?? 1}:{" "}
              {progress?.current}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${progress ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {!busy && progress && progress.done === progress.total && !progress.failed.length ? (
          <p role="status" className="flex items-center gap-2 text-xs text-emerald-400">
            <Check className="size-4" aria-hidden /> {progress.total}{" "}
            {progress.total === 1 ? "voz importada" : "vozes importadas"} com sucesso.
          </p>
        ) : null}
        {!busy && progress?.failed.length ? (
          <p role="status" className="flex items-start gap-2 text-xs text-destructive">
            <X className="mt-0.5 size-4 shrink-0" aria-hidden /> Revise os arquivos que falharam e
            tente novamente.
          </p>
        ) : null}
        {available === null ? (
          <p role="status" className="text-xs text-muted-foreground">
            Verificando motor de voz…
          </p>
        ) : null}
        {available === false ? (
          <p className="text-xs text-muted-foreground">
            O motor de clonagem está indisponível neste servidor.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Upload className="size-4 shrink-0" aria-hidden /> Os arquivos ficam no serviço privado
          desta conta e não entram no catálogo público.
        </p>
      </div>
    </details>
  );
}
