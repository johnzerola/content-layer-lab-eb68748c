# ChatScene — benchmark de fidelidade das vozes autorizadas

Data: 2026-09-27

## Objetivo

Comparar alternativas zero-shot para preservar a identidade das sete amostras
curtas autorizadas do catálogo privado. Nenhum áudio ou embedding pessoal foi
adicionado ao Git.

## Método

- Texto comum: `Esta é a minha voz original.`
- Métrica: similaridade cosseno do `VoiceEncoder` incluído no Chatterbox.
- Baseline: Chatterbox PT-BR V3 em modo de fidelidade.
- Candidatos: Qwen3-TTS 0.6B Base, OpenVoice V2 e uma segunda passagem pelo
  conversor S3Gen oficial do Chatterbox.
- OpenVoice e Qwen foram avaliados em ambientes isolados e não foram ativados
  no produto porque não melhoraram o conjunto.

## Resultado da conversão seletiva Chatterbox

| Voz | Direta | Conversão | Delta | Pipeline aprovado |
| --- | ---: | ---: | ---: | --- |
| Base 1 | 0,8460 | 0,8145 | -0,0314 | Direto |
| Base 2 | 0,8223 | 0,8584 | +0,0361 | Conversão |
| Base 3 | 0,8362 | 0,8428 | +0,0066 | Direto |
| Base 4 | 0,8447 | 0,8341 | -0,0106 | Direto |
| Base 5 | 0,7796 | 0,7850 | +0,0054 | Direto |
| Base 6 | 0,7890 | 0,8292 | +0,0402 | Conversão |
| Base 7 | 0,7828 | 0,7990 | +0,0162 | Conversão |

O manifesto privado ativa `voiceConversionPass` somente nas bases 2, 6 e 7.
As demais permanecem no caminho direto. A seleção é uma propriedade da
identidade, não um efeito de atuação escolhido pelo usuário.

## Experimentos rejeitados

- Repetir uma referência curta até dez segundos reduziu a voz 7 de 0,8317
  para 0,7996.
- OpenVoice V2 reduziu a similaridade nas quatro vozes representativas
  avaliadas.
- Qwen3-TTS 0.6B Base não superou o Chatterbox nas amostras curtas e apresentou
  custo de carga incompatível com a RTX 2060 de 6 GB.

## Limite conhecido

O ganho é real, mas as gravações de 3,5 a 7,7 segundos continuam curtas e muito
interpretadas. Para obter uma identidade perceptualmente próxima da gravação,
o próximo insumo necessário é uma amostra limpa de 20 a 30 segundos, com uma
única pessoa, sem música, eco, cortes ou troca de personagem.
