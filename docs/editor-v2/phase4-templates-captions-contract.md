# Editor V2 — contrato de templates e legendas

## Templates

Cada item de template contém um `TemplateDefinition` tipado com duração, proporções compatíveis, tempo de preview, placeholders e um `TemplateDoc` completo. O preview da biblioteca desenha as camadas desse documento; não usa um retângulo genérico diferente do conteúdo aplicado.

`resolveTemplateApplication` transforma as camadas visíveis em clipes editáveis e cria uma `TemplateInstance` que registra versão, documento, instante da aplicação e IDs dos clipes. `ApplyTemplateCommand` adiciona tudo de forma atômica, permitindo um único undo/redo.

Uma aplicação incompatível com a proporção do projeto é recusada antes de alterar o estado.

## Legendas

Um preset de legenda define estilo, posição, modo de destaque e motion. Ao inserir uma legenda, `resolveCaptionInsertion` cria simultaneamente:

- um clipe na trilha `captions`;
- um `CaptionCue` com início, fim e texto;
- palavras com IDs e intervalos absolutos reproduzíveis;
- referência do clipe ao cue e ao preset.

O canvas resolve o cue pelo mesmo `resolveCompositionFrame` usado pelo contrato de render. O modo `word` ou `karaoke` escolhe a palavra ativa pelo tempo do projeto. A edição do texto reconstrói os intervalos de palavras. Move, trim, split e delete mantêm cue e clipe sincronizados.

Todo motion visual possui a variante CSS `motion-reduce`, preservando conteúdo e removendo movimento quando o sistema solicita redução.

## Renderização

`createEditorRenderManifest` inclui estilos, metadados, tracks de captions com cues/words e instâncias de templates. O encoder final da Fase 6 poderá consumir esses dados sem reinterpretar o estado da interface.
