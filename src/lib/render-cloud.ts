/**
 * Render na nuvem — tipos compartilhados entre o app e o worker da VPS.
 *
 * O navegador só monta a "receita" (preset) e envia os arquivos uma única vez.
 * A partir daí a fila roda no servidor: dá para fechar o navegador e voltar
 * depois só para baixar o resultado.
 */

export type CloudRenderStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export const CLOUD_STATUS_LABEL: Record<CloudRenderStatus, string> = {
  queued: "na fila",
  uploading: "enviando",
  processing: "renderizando",
  completed: "pronto",
  failed: "falhou",
  cancelled: "cancelado",
};

export interface CloudRenderItem {
  id: string;
  name: string;
  status: CloudRenderStatus;
  /** 0-100 */
  progress: number;
  stage: string | null;
  /** link assinado do arquivo final (só quando concluído) */
  resultUrl: string | null;
  error: string | null;
}

export interface CloudRenderBatch {
  id: string;
  tool: string;
  label: string | null;
  status: CloudRenderStatus;
  total: number;
  done: number;
  errors: number;
  createdAt: string;
  items: CloudRenderItem[];
}

/** Versão do formato do preset enviado ao worker (o worker valida isto). */
export const PRESET_VERSION = 1;

export interface CloudPreset {
  version: number;
  /** template completo, mesma fonte de verdade da prévia no canvas */
  template: unknown;
  /** quantas variações antiduplicidade gerar por vídeo */
  variants: number;
  /** plataformas de saída (formato/bitrate) */
  platforms: string[];
  /** legendas queimadas no servidor */
  captions: boolean;
}

export function batchIsActive(status: CloudRenderStatus) {
  return status === "queued" || status === "uploading" || status === "processing";
}

/** Progresso 0-100 do lote inteiro, considerando o item em andamento. */
export function batchPercent(batch: CloudRenderBatch): number {
  if (!batch.items.length) return batch.status === "completed" ? 100 : 0;
  const sum = batch.items.reduce(
    (acc, item) =>
      acc + (item.status === "completed" ? 100 : item.status === "failed" ? 100 : item.progress),
    0,
  );
  return Math.round(sum / batch.items.length);
}
