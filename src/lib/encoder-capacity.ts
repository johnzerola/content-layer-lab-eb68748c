/** Resume as soon as the encoder has room, without a tight timer-polling loop. */
export function waitForEncoderCapacity(
  encoder: VideoEncoder,
  cancelled: () => boolean,
  getError: () => Error | null,
  limit = 6,
  timeoutMs = 20_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = performance.now();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      encoder.removeEventListener('dequeue', check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      clearTimeout(timer);
      const error = getError();
      if (cancelled()) return finish(new DOMException('cancelado', 'AbortError'));
      if (error) return finish(error);
      if (encoder.state === 'closed') return finish(new Error('O codificador foi encerrado'));
      if (encoder.encodeQueueSize <= limit) return finish();
      if (performance.now() - started >= timeoutMs) return finish(new Error('O codificador de vídeo parou de responder'));
      // Also detects cancellation/stalls. Older implementations get a fallback.
      timer = setTimeout(check, 'ondequeue' in encoder ? 250 : 16);
    };
    encoder.addEventListener('dequeue', check);
    check();
  });
}
