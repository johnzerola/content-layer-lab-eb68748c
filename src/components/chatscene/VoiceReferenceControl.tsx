import { useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/base";
import { uploadVoiceReference, removeVoiceReference } from "@/lib/chatscene/voice.functions";
import type { VoiceProfile } from "@/lib/chatscene/voice";

type Reference = NonNullable<VoiceProfile["reference"]>;
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
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (file: File) => {
    if (!authorized || busy) return;
    setError(null);
    if (file.size > 12 * 1024 * 1024) {
      setError("Escolha um áudio de até 12 MB.");
      return;
    }
    setBusy(true);
    try {
      const audio = await new Promise<string>((accept, reject) => {
        const reader = new FileReader();
        reader.onload = () => accept(String(reader.result).split(",")[1]!);
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(file);
      });
      const result = await upload({ data: { audio, authorized: true } });
      onAttach({ ...result, name: file.name.slice(0, 100) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar a referência.");
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir a referência.");
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
          Envie 3 a 30 segundos de uma pessoa falando em português, sem música. A referência será
          usada para gerar novas falas de {participantName} a partir dos textos.
        </p>
        {reference ? (
          <div className="space-y-2">
            <p className="break-words text-xs" role="status">
              Referência pronta: {reference.name} · {reference.durationSec.toFixed(1)} s
            </p>
            <p className="text-xs text-muted-foreground">
              Use Ouvir para testar ou Gerar vozes ausentes para narrar as mensagens. As falas são
              geradas por IA.
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
        ) : (
          <>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(event) => setAuthorized(event.target.checked)}
                className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              Esta voz é minha ou tenho autorização escrita da pessoa adulta para usá-la.
            </label>
            <label htmlFor={inputId} className="block text-xs font-medium">
              Áudio de referência de {participantName}
            </label>
            <input
              id={inputId}
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,.wav,.mp3,.m4a,.ogg,.flac"
              disabled={!authorized || busy || available !== true}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void send(file);
                event.target.value = "";
              }}
              className="block min-h-11 w-full min-w-0 rounded-md border border-border p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </>
        )}
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-xs">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
            Processando referência…
          </p>
        ) : null}
        {!reference && available === null ? (
          <p role="status" className="text-xs text-muted-foreground">
            Verificando motor de voz…
          </p>
        ) : null}
        {!reference && available === false ? (
          <p className="text-xs text-muted-foreground">
            O motor de clonagem está indisponível neste servidor. As vozes sintéticas continuam
            disponíveis.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Upload className="size-4 shrink-0" aria-hidden /> Referência privada desta conta. Excluir
          remove a amostra do servidor; áudios já gerados permanecem no projeto.
        </p>
      </div>
    </details>
  );
}
