import { layoutMessages, type Ctx2D } from "./draw";
import type { ChatSceneProject } from "./types";
import type { ChatTheme } from "./theme";
import type { MessageLayoutEstimator } from "./page-manager";

/**
 * Adapter over the existing renderer; no second font/line-wrapping implementation.
 * Call after fonts load, at render dimensions. Declared mediaAspect is authoritative;
 * resolve media metadata into the document before compiling (never from load order).
 * Header and outer padding must already be subtracted from maxContentHeight.
 */
export function createMessageLayoutEstimator(
  ctx: Ctx2D, project: ChatSceneProject, theme: ChatTheme, width: number, metricsHeight: number,
): MessageLayoutEstimator {
  if (![width, metricsHeight].every((n) => Number.isFinite(n) && n > 0)) throw new Error("Invalid layout dimensions");
  return (messages) => {
    ctx.save();
    try {
      return layoutMessages(ctx, project, theme, messages, width, metricsHeight, undefined, metricsHeight).contentH;
    } finally {
      ctx.restore();
    }
  };
}
