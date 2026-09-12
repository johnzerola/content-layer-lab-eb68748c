# Padrões transferíveis para o Editor V2

| Padrão e fonte | Problema que resolve | Feedback/atalho | Experimento mínimo |
|---|---|---|---|
| Timeline multitrack de OpenVideo | clips e overlays difíceis de alinhar | snapping visual, seleção e trim | uma fixture com vídeo + caption + música |
| Undo/redo e dim de passado de Captiony | edição temporal sem orientação | `S`, setas, zoom | aplicar a cues sem tocar render |
| Registry de cenas de Keyloom | templates parecem cards genéricos | preview real antes de inserir | gerar thumbnail a partir do mesmo JSON |
| Envelope/regions de WaveSurfer | volume e fades ficam invisíveis | pontos arrastáveis | volume de uma faixa com undo |
| Stores por domínio de OpenReel/Clypra | callbacks fragmentam estado | status de render/performance | separar seleção e mídia sem migrar tudo |
| Reduced motion de Motion/Radix | efeitos podem prejudicar acessibilidade | foco e `prefers-reduced-motion` | desligar glow/animação em modo reduzido |

Cada padrão deve ser validado em uma fixture e registrado com screenshot, tempo de interação, acessibilidade e comportamento de exportação antes de virar componente comum.
