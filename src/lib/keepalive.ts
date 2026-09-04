/**
 * Mantém o processamento em velocidade cheia quando a aba está em segundo
 * plano (minimizada, atrás do YouTube, em outra janela).
 *
 * Dois truques são usados:
 *  1. timers dentro de um Web Worker — o navegador não estrangula
 *     setTimeout de workers como faz na thread principal (1 tick/s);
 *  2. um AudioContext silencioso — abas que "tocam áudio" ficam de fora
 *     das políticas agressivas de economia de energia.
 */

let worker: Worker | null = null;
let seq = 0;
const waiters = new Map<number, () => void>();

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    const src = `self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)}`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (e: MessageEvent<number>) => {
      const done = waiters.get(e.data);
      if (done) {
        waiters.delete(e.data);
        done();
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** setTimeout que continua preciso com a aba em segundo plano. */
export function bgSleep(ms: number): Promise<void> {
  const w = ensureWorker();
  if (!w) return new Promise((r) => setTimeout(r, ms));
  const id = ++seq;
  return new Promise<void>((resolve) => {
    waiters.set(id, resolve);
    w.postMessage({ id, ms });
    // segurança: se o worker morrer, não trava o lote
    setTimeout(() => {
      if (waiters.delete(id)) resolve();
    }, ms + 2000);
  });
}

let audioCtx: AudioContext | null = null;
let holders = 0;

/**
 * Segura a aba "ativa" enquanto o lote roda. Devolve a função de liberação —
 * chame sempre em finally.
 */
export function holdBackground(): () => void {
  holders++;
  if (holders === 1 && typeof window !== "undefined") {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        void audioCtx.resume().catch(() => {});
      }
    } catch {
      audioCtx = null;
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0 && audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };
}

/** Notificação do sistema quando o lote termina (a aba pode estar em outra janela). */
export async function askNotifyPermission() {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notifySystem(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: "vaiviral-lote" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* navegador sem suporte */
  }
}
