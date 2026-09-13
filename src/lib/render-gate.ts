/**
 * Portão global de renderização.
 *
 * A fila do lote roda N vídeos ao mesmo tempo e, dentro de cada vídeo, várias
 * saídas (plataformas/variações) também rodavam em paralelo. Como o pool tem
 * poucos workers, isso abria muito mais trabalhos do que a máquina aguenta:
 * todos ficavam lentos, o vigia derrubava alguns e o lote ainda refazia em
 * "modo seguro". Aqui limitamos o total simultâneo ao tamanho real do pool.
 */
import { poolSize } from "./render-pool";

let running = 0;
const waiting: (() => void)[] = [];

function limit() {
  return Math.max(1, poolSize());
}

/** Executa `task` respeitando o limite global de renderizações simultâneas. */
export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= limit()) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  try {
    return await task();
  } finally {
    running = Math.max(0, running - 1);
    waiting.shift()?.();
  }
}
