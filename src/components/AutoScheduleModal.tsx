import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BulkScheduleModal, type BulkScheduleItem } from "@/components/BulkScheduleModal";
import { listAccounts, type SocialAccount } from "@/lib/social";
import { recordClipOutcome } from "@/lib/clip-feedback";

interface AutoScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: {
    blob: Blob;
    fileName: string;
    headline?: string;
    clipTags?: string[];
    score?: number;
    seconds?: number;
  }[];
  onComplete: () => void;
  onAutoConfig?: (config: any) => void;
}

/**
 * Agendamento em lote do ViralBatch / CorteIA.
 * Usa o mesmo motor de distribuição da Agenda (posts por dia + horários).
 */
export function AutoScheduleModal({
  open,
  onOpenChange,
  items,
  onComplete,
  onAutoConfig,
}: AutoScheduleModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);

  useEffect(() => {
    if (!open) return;
    listAccounts()
      .then(setAccounts)
      .catch(() => toast.error("Erro ao carregar contas."));
  }, [open]);

  const bulkItems = useMemo<BulkScheduleItem[]>(
    () =>
      items.map((item) => ({
        file: new File([item.blob], item.fileName, {
          type: item.blob.type || "video/mp4",
        }),
        ...(item.headline ? { caption: item.headline } : {}),
        meta: {
          clipTags: item.clipTags ?? [],
          score: item.score ?? 0,
          seconds: item.seconds ?? 0,
        },
      })),
    [items],
  );

  if (!open) return null;

  return (
    <BulkScheduleModal
      open={open}
      onClose={() => onOpenChange(false)}
      accounts={accounts}
      items={bulkItems}
      hideFilePicker
      subtitle={`${items.length} arquivo(s) prontos · divididos automaticamente por dia`}
      onItemScheduled={async (entry, postId) => {
        const tags = (entry.meta?.["clipTags"] as string[] | undefined) ?? [];
        if (!postId || tags.length === 0) return;
        await recordClipOutcome({
          postId,
          tags,
          score: (entry.meta?.["score"] as number | undefined) ?? 0,
          seconds: (entry.meta?.["seconds"] as number | undefined) ?? 0,
        });
      }}
      {...(onAutoConfig
        ? {
            secondaryAction: {
              label: "Agendar no lote",
              run: (config) => {
                onAutoConfig({
                  accountId: config.accountId,
                  kind: config.kind,
                  caption: config.caption,
                  perDay: config.perDay,
                  slotMode: config.mode,
                  times: config.times,
                  windowStart: config.windowStart,
                  windowEnd: config.windowEnd,
                  weekdays: config.weekdays,
                });
                onOpenChange(false);
              },
            },
          }
        : {})}
      onDone={onComplete}
    />
  );
}
