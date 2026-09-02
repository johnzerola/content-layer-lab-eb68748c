/** Aplicar template a N vídeos: cria o batch job no backend e acompanha o progresso. */
import { useEffect, useState } from "react";
import {
  BATCH_STATUS_LABEL,
  createBatchJob,
  DEFAULT_BATCH_SETTINGS,
  estimateCredits,
  listFailedItems,
  retryFailedItems,
  watchBatchJob,
  type BatchItemRecord,
  type BatchJobRecord,
  type BatchSettings,
  type BatchTarget,
} from "@/lib/editor/batch.service";
import type { VideoTemplateRecord } from "@/lib/video-template/types";

interface Props {
  open: boolean;
  onClose: () => void;
  targets: BatchTarget[];
  templates: VideoTemplateRecord[];
  initialTemplateId?: string | null;
}

const OPTIONS: { key: keyof BatchSettings; label: string }[] = [
  { key: "applyCaptions", label: "Aplicar legendas" },
  { key: "applyBrandKit", label: "Aplicar Brand Kit" },
  { key: "applyFilters", label: "Aplicar filtros" },
  { key: "applyMusic", label: "Aplicar música" },
  { key: "applyCta", label: "Aplicar CTA" },
  { key: "generateTitle", label: "Gerar título automaticamente" },
  { key: "autoRender", label: "Enfileirar renderização" },
];

export function BatchApplyModal({ open, onClose, targets, templates, initialTemplateId }: Props) {
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId ?? templates[0]?.id ?? null);
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS);
  const [job, setJob] = useState<BatchJobRecord | null>(null);
  const [failed, setFailed] = useState<BatchItemRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    return watchBatchJob(job.id, setJob);
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const total = targets.length;
  const percent = job && job.total_items ? Math.round((job.processed_items / job.total_items) * 100) : 0;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createBatchJob({ templateId, targets, settings });
      setJob(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o lote.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Aplicar template a {total} vídeos</h2>
            <p className="text-xs text-muted-foreground">
              O processamento roda no servidor — você pode fechar esta aba.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {!job && (
          <>
            <label className="block text-sm">
              Template
              <select
                value={templateId ?? ""}
                onChange={(e) => setTemplateId(e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-background px-2 py-2"
              >
                {!templates.length && <option value="">Nenhum template disponível</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings[o.key])}
                    onChange={(e) => setSettings((s) => ({ ...s, [o.key]: e.target.checked }))}
                  />
                  {o.label}
                </label>
              ))}
            </div>

            <p className="rounded-lg border border-border/60 bg-background/60 p-2 text-xs">
              Custo estimado: <strong>{estimateCredits(total, settings)} créditos</strong>
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="button"
              disabled={busy || !templateId || !total}
              onClick={() => void start()}
              className="w-full rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Enfileirando..." : `Aplicar a ${total} vídeos`}
            </button>
          </>
        )}

        {job && (
          <div className="space-y-3">
            <p className="text-sm">
              {BATCH_STATUS_LABEL[job.status]} — {job.processed_items} / {job.total_items}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {job.successful_items} concluídos · {job.failed_items} falharam
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                className="rounded-lg border border-border/60 px-3 py-1.5"
                onClick={() => void listFailedItems(job.id).then(setFailed)}
              >
                Ver erros
              </button>
              <button
                type="button"
                className="rounded-lg border border-border/60 px-3 py-1.5"
                onClick={() => void retryFailedItems(job.id)}
              >
                Tentar novamente
              </button>
              <button type="button" className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-primary-foreground" onClick={onClose}>
                Fechar
              </button>
            </div>
            {failed.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {failed.map((f) => (
                  <li key={f.id}>
                    {f.label ?? f.video_id}: {f.error_message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
