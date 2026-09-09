# Fase D — validação da separação de áudio

Esta fase separa o que pode ser comprovado automaticamente do que precisa de
escuta humana. O aplicativo já tem um contrato de mixagem: ao silenciar uma
faixa `music`, a exportação usa somente a faixa de voz e não pode reativar o
áudio original.

## Testes automatizados

O teste Vitest de mixagem confirma que uma música muda não é decodificada para
o render e que a voz continua sendo iniciada no mesmo corte. O novo validador
também mede RMS, pico, duração e correlação dos stems:

```sh
python scripts/validate_audio_stems.py \
  --voice voice.wav --music music.wav \
  --scenario voice-high-music-low --check-muted

python scripts/validate_audio_stems.py \
  --voice voice.wav --music music.wav \
  --scenario voice-low-music-high --check-muted
```

Os cenários cobrem voz alta/música baixa e voz baixa/música alta. O relatório
serve para detectar troca de stems, duração diferente e ganho incorreto. O
resultado `music_muted_keeps_voice=true` confirma o contrato de silenciamento;
ele não é uma prova de que o modelo removeu todo vazamento musical.

## Teste real de separação

Para confirmar remoção de música da narração, usar o mesmo WAV original enviado
ao Hostear e os dois WAV retornados pelo job. Comparar os arquivos em um editor
ou player: voz isolada, música isolada, música muda com voz audível e mixagem
original. Registrar também os relatórios do validador antes de aprovar um novo
modelo.

Um modelo musical pode manter canto, reverberação ou instrumentos na faixa de
voz. Por isso a aprovação precisa combinar métricas, escuta e um conjunto de
amostras reais de fala; uma senoide ou ruído sintético só valida o roteamento.
