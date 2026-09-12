# MCP matrix

All entries remain read-only by default. Credentials, browser cookies and tokens are never stored in this repository.

| MCP | Status | Official | Read / write | Risks and auth | Fit / recommendation |
|---|---|---|---|---|---|
| Figma | Not configured | Yes, registry package `com.figma.mcp/mcp` | Design context; write depends on configured permissions | Requires Figma authorization; design-file writes need explicit review | P0 when Figma source is available; configure read-first |
| Storybook | Not installed | Yes, `@storybook/addon-mcp` | Component docs, stories and tests; can author stories | Local dev server and new dependencies | P0 after component-contract decision; do not add blindly |
| Playwright | Configured, isolated/headless | Yes | Browser navigation, screenshots and interaction tests | Browser content is visible to MCP; do not connect personal profiles | P0 now; retain isolated profile |
| Chrome DevTools | Configured, isolated/headless | Yes | Console, network, screenshots, traces and browser control | Live browser data visible to MCP; CrUX disabled in config | P0 now; retain no-usage-statistics/no-CrUX flags |
| shadcn | Not configured | Project tooling, not design source of truth | Registry discovery and code generation | Dependency/filesystem writes | P1 only after token/dependency/diff review |
| Southleft Design Systems | Not configured | Verify publisher and license before use | Advisory research | Third-party content and possible remote execution | P1 research only; validate normative claims against WCAG/APG |
| 21st | Not configured | Verify current ownership/license | Pattern search, may generate UI | Generated code/dependency risk | P2 inspiration only |
| Supernova | Not configured | Verify current contract/license | Token/design-system sync may write | SaaS authorization and design-data exposure | P2 when source of truth is selected |
| Penpot | Not configured | Open-source product, exact server/license pending | Design context and potential writes | Account/file permissions | P2 alternative if adopted intentionally |

Current versions are pinned for Playwright and Chrome DevTools in `.codex/config.toml`; versions and terms for uninstalled MCPs must be rechecked at installation time. Sources: [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview), [Playwright MCP](https://playwright.dev/mcp/configuration/options), [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), [MCP Registry](https://registry.modelcontextprotocol.io/).
