# Transições e keyframes

## Keyframes por propriedade

```ts
type AnimatableProperty =
  | "x" | "y" | "scale" | "rotation" | "opacity"
  | "volume" | "blur" | "color";

interface Keyframe { time: number; value: number | string; easing: Easing; }
interface PropertyTrack { property: AnimatableProperty; keyframes: Keyframe[]; }
```

O editor deve mostrar uma linha por propriedade no inspector, pontos arrastáveis na timeline, valor numérico editável, easing e copiar/colar de keyframes. Uma propriedade sem pontos usa valor estático. Keyframes pertencem ao clip e sobrevivem ao trim por regra explícita (`clamp`, `shift` ou `split`).

## Transições

Uma transição fica entre dois clips e declara duração, tipo, easing, parâmetros e fallback. A duração nunca pode exceder a mídia disponível em ambos os lados. O preview desenha a transição em tempo de projeto; o render usa o mesmo resolver.

## Segurança de estado

Mover vários pontos é um comando coalescido. Cancelar drag restaura o snapshot anterior. Undo de uma transição restaura seleção, duração e limites dos dois clips.

## Biblioteca

Templates de transição devem ser dados versionados com preview renderizado do próprio engine. Evitar efeitos que só funcionem em CSS se o exportador não possuir equivalente.
