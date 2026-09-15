# Framework and API Reference

## Contents

- Installation
- SSR frameworks
- Elements and attributes
- Slots and parts
- Tokens and presets

## Installation

```bash
npm install github:hwyuanzi/LiquidGlass-UI
```

```js
import "@hwyuanzi/liquid-glass-ui";
import "@hwyuanzi/liquid-glass-ui/css";
```

The GitHub package installs under its scoped manifest name. After a registry
release is published, `npm install @hwyuanzi/liquid-glass-ui` is equivalent.
For a static prototype, copy `assets/starter.html`. For production CDN use,
replace its `@main` URLs with a release tag or commit.

## SSR frameworks

In Next.js, register the elements in a client component:

```jsx
"use client";

import "@hwyuanzi/liquid-glass-ui";
import "@hwyuanzi/liquid-glass-ui/css";

export function GlassCard() {
  return (
    <liquid-glass-card heading="Project status" link="/status">
      <span slot="description">All systems are operating normally.</span>
    </liquid-glass-card>
  );
}
```

Vue should mark `liquid-glass-*` tags as custom elements. Angular schemas may
need `CUSTOM_ELEMENTS_SCHEMA`. Svelte and plain HTML require only the imports.

## Elements and attributes

| Element                 | Purpose                                |
| ----------------------- | -------------------------------------- |
| `<liquid-glass>`        | Generic slotted surface                |
| `<liquid-glass-card>`   | Heading, description, icon, and action |
| `<liquid-glass-button>` | Button or link control                 |

Shared attributes:

| Attribute                  | Effect                                         |
| -------------------------- | ---------------------------------------------- |
| `appearance="clear         | tinted"`                                       | Select material density |
| `interactive`              | Let a generic surface respond to pointer hover |
| `refraction`               | Enable progressive edge displacement           |
| `refraction-scale="0..32"` | Set clamped displacement strength              |

Card attributes: `heading`, `link`, `cta`, and optional `target`.

Button attributes: `href`, `target`, `type`, `disabled`, and `aria-label`.
Without `href`, the inner control is a button. With `href`, it is a link.

## Slots and parts

Cards expose `icon` and `description` slots. Buttons and generic surfaces use
the default slot. Shadow parts are `surface`, `sheen`, and `control` where
applicable.

## Tokens and presets

Override `--lg-*` properties on `:root`, a wrapper, or a component. Prefer the
public tokens for blur, saturation, brightness, tint, radius, border, rim,
sheen, motion, shadows, focus ring, and typography.

Use `.lg-on-light` over bright content, `.lg-clear` for a lighter material, and
`.lg-tinted` for stronger separation. `.lg-surface` applies the material to a
plain element without a custom element.
