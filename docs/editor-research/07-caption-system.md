# Sistema de legendas

## Estado desejado

Legenda é uma track temporal no documento, com cues, palavras opcionais, idioma, estilo, animação e vínculo de fonte. Ela não deve ser apenas uma prop do painel.

```ts
interface CaptionCue {
  id: string; start: number; end: number; text: string;
  words?: { text: string; start: number; end: number }[];
  styleId: string; animationId?: string;
}
```

## Fluxo

- editar texto altera cue e marca `captionRevision`;
- dividir une/fragmenta palavras sem deslocar o relógio;
- presets são tokens + layout + animação, não imagens;
- preview de preset usa exatamente a mesma função de composição;
- SRT/VTT/ASS são import/export adapters; o documento interno é único.

## Legendas animadas

Entrada, destaque por palavra e saída devem ser resolvidos por tempo relativo ao cue e por easing declarativo. `prefers-reduced-motion` reduz a animação sem remover legibilidade. O exportador deve ter teste de frame em início, meio e fim do cue.

## Usabilidade

Atalhos: espaço reproduz, `S` divide, `Enter` edita cue, `Cmd/Ctrl+Z` desfaz. O foco nunca deve saltar para o painel ao clicar numa palavra da timeline.
