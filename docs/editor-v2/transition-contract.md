# Contrato de transição

`TransitionDefinition` separa definição de uso. Declara duração padrão/mínima/máxima, parâmetros e `rendererId`. `Transition` referencia `fromClipId` e `toClipId`; não é arquivo de vídeo.

A Library usa `transitionFrame(rendererId, progress)` para gerar preview real sobre duas cenas programáticas. O compositor V2 adotará o mesmo resolver. A validação garante durações coerentes e ids únicos.

Built-ins: Cut, Cross Dissolve, Fade, Fade Black/White, Slide nas quatro direções, Push, Wipe, Blur e Zoom In/Out.
