# ChatScene — Skill Matrix

Última auditoria: 2026-09-12. Escopo: apenas competências de agente. Nenhuma
alteração de aplicativo, banco, Cleaner IA, Editor V1 ou Editor V2.

## Remotion (oficial, remotion-dev/skills)

| Skill | Status | Observação |
| --- | --- | --- |
| remotion-best-practices | IMPORTED / ACTIVE | roteador; carrega as sub-referências abaixo |
| remotion-create | IMPORTED | sub-referência do roteador |
| remotion-markup | IMPORTED | sub-referência |
| remotion-studio | IMPORTED | sub-referência |
| remotion-render | IMPORTED | sub-referência |
| remotion-docs | IMPORTED | fonte de API atual — usar antes de escrever API de memória |
| remotion-maps | IMPORTED | presente, NOT_NEEDED para ChatScene |
| remotion-upgrade | IMPORTED | manutenção de versão |
| remotion-captions | IMPORTED / ACTIVE | legendas e karaokê |
| remotion-multimedia | IMPORTED / ACTIVE | Mediabunny, mídia no browser |
| remotion-saas | IMPORTED / ACTIVE | Player, render server-side |
| remotion-interactivity | IMPORTED / ACTIVE | markup interativo no Studio |

Versão do pacote: 4.0.523. Nenhuma skill Remotion foi recriada ou reescrita.

## Competências existentes reaproveitadas (EXISTING)

product-design-director, design-context-intake, editor-ux-designer,
ux-flow-engineer, interaction-designer, design-system-engineer, frontend-design,
web-design-guidelines, visual-qa-gate, accessibility-gate,
frontend-performance-gate, creative-tool-ux-researcher, web-application-engineer,
code-quality-engineer, ffmpeg-skill, react-react, react-typescript,
react-feature-arch, ux-usability-foundations, ui-visual-composition,
interaction-patterns-components, information-architecture-navigation,
design-systems-frontend-architecture, accessibility-inclusive-design.

## Competências ChatScene criadas (CREATED)

| Skill | Responsabilidade | Sobreposição resolvida |
| --- | --- | --- |
| chatstory-product-architect | fonte única de verdade, limites de módulo | complementa product-design-director |
| conversation-ux-designer | Simple/Studio Mode, composer, inspector | usa o contrato de editor-ux-designer |
| message-animation-engineer | movimento de bolhas, digitação, reações | nova |
| conversation-timing-engineer | ConversationClock, sincronia de áudio | nova |
| media-message-engineer | imagem, vídeo, GIF, sticker, áudio | reutiliza Asset Library existente |
| voice-casting-engineer | VoiceProfile, provider, duração | nova |
| short-form-video-designer | 9:16, safe zones, ritmo | nova |
| chat-theme-designer | temas de conversa | usa design-system-engineer |
| chatstory-render-engineer | ConversationRenderer, Remotion | consome skills Remotion |
| chatstory-visual-qa | QA visual específico de chat | delega o geral ao visual-qa-gate |
| asset-license-gate | licenças de assets e dependências | nova |

## REJECTED / NOT_NEEDED

- Duplicatas de acessibilidade, design system e QA visual genérico: já cobertas.
- remotion-maps: fora do escopo do ChatScene.
- Skills de Vitest/Playwright de terceiros: o ambiente já tem ambos por CLI.
