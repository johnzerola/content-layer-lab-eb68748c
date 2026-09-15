# Liquid Glass Design Guidelines

## Contents

- Material role
- Optical treatment
- Motion
- Adaptivity and accessibility
- Performance
- Review checklist

## Material role

Use glass to separate controls and navigation from content while still allowing
the surrounding environment to show through. Avoid stacking glass on glass or
turning every content card into a translucent panel. Dense text, forms, and
tables usually need a more opaque surface.

Establish hierarchy in this order:

1. Content remains the visual focus.
2. Primary controls are easy to find and read.
3. Glass communicates elevation and grouping.
4. Decorative highlights remain subordinate.

## Optical treatment

- Use a low-alpha tint, moderate blur, restrained saturation, a subtle upper
  rim, and a faint lower occlusion.
- Let the backdrop influence color without making text contrast unpredictable.
- Keep the center visually calm. Refraction belongs near curved edges.
- Use smooth displacement maps only. Noise and turbulence read as water,
  plastic, or lens damage.
- Maintain concentricity: nested controls should follow the parent radius with
  consistent inset spacing.
- Prefer the system font stack so typography feels native on macOS while
  remaining appropriate elsewhere.

Recommended starting ranges:

| Property          | Starting range |
| ----------------- | -------------- |
| Blur              | `16–20px`      |
| Saturation        | `120–145%`     |
| Base tint opacity | `0.05–0.12`    |
| Upper sheen       | `0.06–0.12`    |
| Hover lift        | `1–2px`        |
| Hover scale       | `1–1.004`      |
| Response          | `180–280ms`    |

## Motion

Respond to hover as one material surface. Keep keyboard focus geometrically
stable. Avoid cursor-tracking glare, perspective tilt, icon rotation, large
spring overshoot, or long transitions. Disable nonessential motion when
`prefers-reduced-motion: reduce` is active.

## Adaptivity and accessibility

- Test over both bright and dark imagery.
- Increase tint opacity for readability before adding stronger shadows.
- Provide clear and tinted appearances.
- Supply an opaque fallback when backdrop filtering is unavailable.
- Honor reduced transparency, increased contrast, and forced-colors modes.
- Keep focus rings visible inside clipped rounded surfaces.
- Do not rely on glass color alone to communicate selected, disabled, or error
  states.

## Performance

Backdrop filters and SVG displacement are expensive when used across large
areas. Keep refracting surfaces small, avoid deep overlap, do not apply
permanent `will-change`, and test scrolling on integrated graphics hardware.
Refraction is a progressive enhancement, not a requirement for comprehension.

## Review checklist

- Is content still more prominent than the material?
- Are controls readable on every supplied backdrop?
- Does the layout work without refraction or backdrop filtering?
- Are hover and focus distinct without excessive movement?
- Do corner radii and insets feel concentric?
- Are reduced-motion, reduced-transparency, and forced-colors modes usable?
- Are there unnecessary glass layers or permanent compositor hints?
