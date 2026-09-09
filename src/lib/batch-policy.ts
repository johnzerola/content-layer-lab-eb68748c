/** Política de execução para lotes grandes. Mantém a interface responsiva e
 * evita que 40–100 encoders disputem CPU, GPU e memória simultaneamente. */
export interface BatchPolicy {
  concurrency: number;
  serverRecommended: boolean;
  chunkSize: number;
  reason: string;
}

export function batchPolicy(total: number, requested: number, cores = 4): BatchPolicy {
  const safeCores = Math.max(2, cores || 2);
  const hardwareCap = Math.max(1, Math.min(4, Math.floor(safeCores / 4) || 1));
  if (total >= 80) return { concurrency: 1, serverRecommended: true, chunkSize: 10, reason: "Lote grande: uma renderização por vez para proteger memória e GPU." };
  if (total >= 30) return { concurrency: Math.min(2, hardwareCap, Math.max(1, requested)), serverRecommended: true, chunkSize: 10, reason: "Lote extenso: concorrência limitada e salvamento incremental." };
  if (total >= 10) return { concurrency: Math.min(2, hardwareCap, Math.max(1, requested)), serverRecommended: false, chunkSize: 10, reason: "Lote médio: duas renderizações no máximo." };
  return { concurrency: Math.min(4, hardwareCap, Math.max(1, requested)), serverRecommended: false, chunkSize: Math.max(1, total), reason: "Lote pequeno." };
}
