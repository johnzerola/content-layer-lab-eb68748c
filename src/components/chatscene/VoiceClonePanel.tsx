import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Mic2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/base";
import { getVoiceEngineStatus } from "@/lib/chatscene/voice.functions";
import { VoiceReferenceControl } from "./VoiceReferenceControl";
import {
  attachPreset,
  attachVoiceReference,
  voiceProfileOf,
} from "@/lib/chatscene/voice-resolution";
import { missingSpeakingMessages } from "@/lib/chatscene/voice-cast";
import type { ChatSceneProject } from "@/lib/chatscene/types";

export function VoiceClonePanel({
  project,
  patch,
  onGenerate,
  castState,
}: {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  onGenerate: (participantId: string) => void;
  castState: string;
}) {
  const statusFn = useServerFn(getVoiceEngineStatus);
  const latestProject = useRef(project);
  latestProject.current = project;
  const [targetId, setTargetId] = useState<string | null>(project.participants[0]?.id ?? null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId || !project.participants.some((participant) => participant.id === targetId)) {
      setTargetId(project.participants[0]?.id ?? null);
    }
  }, [project.participants, targetId]);
  useEffect(() => {
    let active = true;
    statusFn()
      .then((status) => {
        if (active) setAvailable(status.clone.installed);
      })
      .catch(() => {
        if (active) {
          setAvailable(false);
          setStatusError("Não foi possível verificar o motor de clonagem neste servidor.");
        }
      });
    return () => {
      active = false;
    };
  }, [statusFn]);

  const target =
    project.participants.find((participant) => participant.id === targetId) ??
    project.participants[0];
  if (!target) {
    return (
      <div className="rounded-lg border border-border bg-background/30 p-4">
        <p className="text-sm font-semibold">Adicione um personagem primeiro</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A voz clonada será vinculada a um personagem e usada nas falas dele.
        </p>
      </div>
    );
  }

  const voice = voiceProfileOf(project, target);
  const reference = voice?.reference;
  const missingCount = missingSpeakingMessages(project).filter(
    (item) => item.message.participantId === target.id,
  ).length;
  const attach = (nextReference: NonNullable<typeof reference>) => {
    patch(attachVoiceReference(latestProject.current, target.id, nextReference));
  };
  const remove = () => {
    const current = latestProject.current;
    if (!reference) return;
    patch(
      current.participants.reduce(
        (next, participant) =>
          voiceProfileOf(next, participant)?.reference?.id === reference.id
            ? attachPreset(next, participant.id, "faber-natural")
            : next,
        current,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-label text-muted-foreground">Clonagem de voz</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
          <Mic2 className="size-5 text-primary" aria-hidden /> Envie uma voz para usar nos textos
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Escolha um personagem, envie uma amostra autorizada e o sistema criará novas falas com a
          mesma voz. O áudio enviado não substitui uma mensagem específica: ele vira a identidade de
          voz do personagem.
        </p>
      </div>

      <section
        className="rounded-xl border border-primary/45 bg-primary/5 p-4"
        aria-labelledby="clone-step-title"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            1
          </span>
          <h3 id="clone-step-title" className="text-sm font-semibold">
            Escolha onde aplicar
          </h3>
        </div>
        <label className="mt-4 block text-xs font-medium" htmlFor="voice-clone-target">
          Personagem que vai falar com essa voz
        </label>
        <select
          id="voice-clone-target"
          value={target.id}
          onChange={(event) => setTargetId(event.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {project.participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </select>
      </section>

      <section
        className="rounded-xl border border-border bg-background/45 p-4"
        aria-labelledby="clone-upload-title"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-bold">
            2
          </span>
          <h3 id="clone-upload-title" className="text-sm font-semibold">
            Envie a amostra da voz
          </h3>
        </div>
        <VoiceReferenceControl
          participantName={target.name}
          reference={reference}
          available={available}
          open
          title={reference ? "Amostra clonada e vinculada" : "Selecionar áudio para clonar"}
          onAttach={attach}
          onRemove={remove}
        />
        {available === null ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
            Verificando disponibilidade do clonador…
          </p>
        ) : null}
        {available === true ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
            <Check className="size-3.5" aria-hidden /> Clonador disponível. Use somente voz própria
            ou autorizada.
          </p>
        ) : null}
        {statusError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {statusError}
          </p>
        ) : null}
      </section>

      <section
        className="rounded-xl border border-border bg-background/45 p-4"
        aria-labelledby="clone-generate-title"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-bold">
            3
          </span>
          <h3 id="clone-generate-title" className="text-sm font-semibold">
            Gere as falas
          </h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Depois do upload, clique abaixo para narrar os textos ainda sem áudio de {target.name}. A
          duração real será aplicada à linha do tempo.
        </p>
        <Button
          type="button"
          className="mt-3 min-h-11 w-full"
          disabled={!reference || castState === "running" || missingCount === 0}
          onClick={() => onGenerate(target.id)}
        >
          <Sparkles className="mr-2 size-4" aria-hidden />
          {castState === "running"
            ? "Gerando falas…"
            : missingCount
              ? `Gerar ${missingCount} fala${missingCount === 1 ? "" : "s"} com esta voz`
              : "Todas as falas já têm áudio"}
        </Button>
      </section>
    </div>
  );
}
