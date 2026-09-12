# Design system audit

The project has a viable semantic base: `background`, `surface`, `foreground`, `primary`, `muted`, feedback colours, typography roles, spacing scale, radii, shadows, durations and z-index. Theme variants override the primary family without changing component APIs.

Gaps to address through small diffs: direct visual values remain in editor/caption presets and some routes; component state contracts are not yet catalogued in Storybook; no stated token governance exists for deciding whether a one-off value is an intentional asset value or a new token candidate. Preserve content-specific media/caption colour values unless a scoped audit proves they are interface tokens.

P2 action: create a token inventory and component contract before any global replacement. Do not mass-replace hex values.
