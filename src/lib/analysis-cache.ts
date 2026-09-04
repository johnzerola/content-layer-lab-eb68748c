/**
 * Cache de análise por arquivo — reaproveitado entre variações.
 *
 * Um mesmo vídeo costuma ser exportado várias vezes (variações
 * anti-duplicidade, plataformas diferentes). Tudo que depende só do arquivo
 * (áudio decodificado, tabela de amostras do MP4, placa de fundo, transcrição)
 * é calculado uma única vez e reaproveitado nas exportações seguintes.
 */

/** Identidade estável do arquivo (nome + tamanho + data). */
export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

interface Entry<T> {
  value: Promise<T>;
  at: number;
}

const store = new Map<string, Entry<unknown>>();
/** limite conservador: análises pesadas (áudio) ocupam memória */
const MAX_ENTRIES = 12;

function evict() {
  while (store.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, e] of store) {
      if (e.at < oldest) {
        oldest = e.at;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

/** Executa `fn` uma vez por chave e devolve sempre o mesmo resultado. */
export function analysisCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit) {
    hit.at = Date.now();
    return hit.value;
  }
  const value = fn().catch((err) => {
    // falha não fica presa no cache
    store.delete(key);
    throw err;
  });
  store.set(key, { value, at: Date.now() } as Entry<unknown>);
  evict();
  return value;
}

/** Descarta a análise de um arquivo (ex.: item removido da fila). */
export function dropAnalysis(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

export function clearAnalysisCache() {
  store.clear();
}
