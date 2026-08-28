import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelCloudBatch,
  createCloudBatch,
  deleteCloudBatch,
  listCloudBatches,
  startCloudBatch,
  syncCloudBatch,
} from "@/lib/render-cloud.functions";
import { batchIsActive, type CloudRenderBatch, type CloudPreset } from "@/lib/render-cloud";

export interface CloudSendItem {
  name: string;
  file?: File | undefined;
  sourceUrl?: string | undefined;
  overrides?: Record<string, unknown> | undefined;
}

/**
 * Envia um lote para a fila da VPS: cria o job, sobe os arquivos que não têm
 * link de origem e libera o processamento. Depois disso o navegador pode ser
 * fechado — a fila continua rodando no servidor.
 */
export async function sendBatchToCloud(input: {
  tool: string;
  label?: string;
  preset: CloudPreset;
  items: CloudSendItem[];
  onProgress?: (uploaded: number, total: number) => void;
}): Promise<string> {
  const created = await createCloudBatch({
    data: {
      tool: input.tool,
      ...(input.label ? { label: input.label } : {}),
      preset: input.preset as unknown as Record<string, unknown>,
      items: input.items.map((item) => ({
        name: item.name,
        ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
        overrides: item.overrides ?? {},
      })),
    },
  });

  const uploads = created.items.filter((row) => row.needsUpload);
  let uploaded = 0;
  input.onProgress?.(0, uploads.length);

  for (const row of created.items) {
    if (!row.needsUpload) continue;
    const source = input.items[row.index];
    if (!source?.file) throw new Error(`Arquivo obrigatório ausente: "${row.name}".`);
    const response = await fetch(`/api/public/render-upload?item=${row.id}`, {
      method: "POST",
      headers: {
        "content-type": source.file.type || "application/octet-stream",
        "x-job-token": created.uploadToken,
        "x-file-name": encodeURIComponent(source.file.name).slice(0, 500),
      },
      body: source.file,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Falha ao enviar "${source.file.name}" para a VPS${detail ? `: ${detail}` : "."}`);
    }
    uploaded += 1;
    input.onProgress?.(uploaded, uploads.length);
  }

  await startCloudBatch({ data: { batchId: created.batchId } });
  return created.batchId;
}

/** Lista os lotes da nuvem com atualização automática enquanto houver fila ativa. */
export function useCloudBatches(enabled = true) {
  const [batches, setBatches] = useState<CloudRenderBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCloudBatches({ data: { limit: 12 } });
      setBatches(list);
      setError(null);
      return list;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "não consegui ler a fila");
      return [] as CloudRenderBatch[];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const list = await refresh();
      if (!alive) return;
      const active = list.filter((b) => batchIsActive(b.status));
      // rede de segurança: se algum webhook se perder, puxamos o estado do worker
      for (const b of active) {
        try {
          await syncCloudBatch({ data: { batchId: b.id } });
        } catch {
          /* worker pode estar reiniciando */
        }
      }
      if (active.length) await refresh();
      if (!alive) return;
      timer.current = setTimeout(tick, active.length ? 5000 : 30000);
    };
    void tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, refresh]);

  return {
    batches,
    loading,
    error,
    refresh,
    cancel: async (batchId: string) => {
      await cancelCloudBatch({ data: { batchId } });
      await refresh();
    },
    remove: async (batchId: string) => {
      await deleteCloudBatch({ data: { batchId } });
      await refresh();
    },
  };
}
