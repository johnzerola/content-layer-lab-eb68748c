# Adobe video removal: public research line

## Confirmed public evidence

- After Effects documents a Content-Aware Fill workflow where the editor
  defines a fill region and generates a fill layer. This is workflow evidence,
  not a disclosure of weights or model architecture. [Adobe Help](https://helpx.adobe.com/after-effects/desktop/remove-objects-from-your-videos/content-aware-fill.html)
- Project Cloak says the user selects the removal region; the prototype uses
  dense tracking both forward and backward to replace pixels from background
  seen elsewhere, falling back to content-aware fill when it is never visible.
  [Adobe Research](https://research.adobe.com/news/cloak-remove-unwanted-objects-in-video/)
- Project Fast Mask publicly describes interactive video-wide object masking;
  it is related segmentation research, not evidence it powers Content-Aware
  Fill. [Adobe Research](https://research.adobe.com/news/project-fast-mask/)

## Technology DNA

| Dimension | Classification |
|---|---|
| Region selection | CONFIRMED: editor-selected fill region |
| Temporal recovery | CONFIRMED for Project Cloak: dense forward/backward tracking |
| Real-background priority | CONFIRMED for Project Cloak |
| Generative fallback | CONFIRMED at a high level for never-observed background |
| Production architecture / weights | UNKNOWN |
| Associated effects | RELATED RESEARCH: separate masks are needed to test shadows/glow; no Adobe attribution |

## Cleaner mapping

The transferable principle is to score/reuse background from other frames
within a scene before generating pixels. Test it as an isolated reference
selection experiment. It does not authorize, reproduce or imply access to
Adobe technology.
