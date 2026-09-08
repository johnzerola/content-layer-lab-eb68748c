import type { PreCrop } from '@/lib/preedit';

export const FULL_CROP: PreCrop = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function boundCrop(c: PreCrop): PreCrop {
  const w = clamp(c.w, 0.02, 1);
  const h = clamp(c.h, 0.02, 1);
  return { x: clamp(c.x, 0, 1 - w), y: clamp(c.y, 0, 1 - h), w, h };
}

export function dragCrop(c: PreCrop, handle: string, dx: number, dy: number): PreCrop {
  if (handle === 'move') return boundCrop({ ...c, x: c.x + dx, y: c.y + dy });
  const left = handle.includes('w') ? clamp(c.x + dx, 0, c.x + c.w - 0.02) : c.x;
  const top = handle.includes('n') ? clamp(c.y + dy, 0, c.y + c.h - 0.02) : c.y;
  const right = handle.includes('e') ? clamp(c.x + c.w + dx, left + 0.02, 1) : c.x + c.w;
  const bottom = handle.includes('s') ? clamp(c.y + c.h + dy, top + 0.02, 1) : c.y + c.h;
  return boundCrop({ x: left, y: top, w: right - left, h: bottom - top });
}
