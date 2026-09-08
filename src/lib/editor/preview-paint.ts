/** Paint only new video frames or explicit edits, with a playback-only fallback. */
export function watchVideoPaint(video: HTMLVideoElement | null, paint: () => void) {
  let raf = 0;
  let frame: number | null = null;
  let disposed = false;
  const visible = () => document.visibilityState !== 'hidden';
  const playing = () => !!video && !video.paused && !video.ended;
  const cancel = () => {
    cancelAnimationFrame(raf); raf = 0;
    if (frame !== null) video?.cancelVideoFrameCallback?.(frame);
    frame = null;
  };
  const nextFrame = () => {
    if (disposed || !visible() || !playing() || frame !== null) return;
    if (video?.requestVideoFrameCallback) {
      frame = video.requestVideoFrameCallback(() => {
        frame = null;
        if (disposed || !visible()) return;
        paint();
        nextFrame();
      });
    } else invalidate();
  };
  const invalidate = () => {
    if (disposed || !visible() || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (disposed || !visible()) return;
      paint();
      nextFrame();
    });
  };
  const sync = () => { cancel(); invalidate(); };
  const events = ['loadeddata', 'seeked', 'play', 'pause', 'ended', 'emptied', 'resize'];
  events.forEach(event => video?.addEventListener(event, sync));
  document.addEventListener('visibilitychange', sync);
  invalidate();
  return { invalidate, dispose: () => {
    disposed = true; cancel();
    events.forEach(event => video?.removeEventListener(event, sync));
    document.removeEventListener('visibilitychange', sync);
  } };
}

/** Preview resolution follows its display size; export dimensions remain untouched. */
export function previewSize(width: number, height: number, displayWidth: number, displayHeight: number, dpr = 1) {
  const scale = Math.min(1, 960 / Math.max(width, height),
    Math.max(displayWidth / width, displayHeight / height) * Math.min(1.5, dpr));
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)) };
}
