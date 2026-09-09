# Fase B — separação de voz e música

Esta fase transforma a separação em um pipeline de qualidade controlada. A
implementação atual mantém o áudio original intacto, gera `vocals.wav` e
`no_vocals.wav` em WAV/float32 e só publica as trilhas depois de validar
formato e duração. O editor continua usando as mesmas trilhas na prévia e no
exportador.

## O que entrou nesta etapa

- Perfil `fast`: `htdemucs`, sem shifts aleatórios e overlap de 25%, adequado
  para uso frequente no Hostear CPU.
- Perfil `quality`: `htdemucs_ft`, um modelo ajustado do Demucs; usa um shift e
  overlap de 50%, com custo de processamento maior.
- Cache de pesos persistente e modo offline opcional. Nenhum job baixa modelo
  automaticamente depois que o cache é validado.
- Saída intermediária sem MP3. A compressão fica para a exportação final, para
  não introduzir artefatos antes da mixagem.
- Manifesto de estado com modelo, perfil, shifts, overlap e formato, para que
  diagnóstico e exportação saibam exatamente qual processamento ocorreu.

## Próximo incremento de qualidade

O próximo passo é um adaptador de ensemble, executado somente quando o perfil
`quality` for solicitado e houver memória suficiente:

1. Demucs/HTDemucs gera a primeira estimativa de voz e acompanhamento.
2. Um modelo MDX-Net ou RoFormer faz uma segunda estimativa em trechos de até
   7,8 s.
3. As duas estimativas são alinhadas, normalizadas e combinadas por um peso
   configurável; não há soma que possa estourar o sinal.
4. Um passe leve de redução espectral e gate de silêncio remove resíduos entre
   frases. O resultado é medido por duração, pico, RMS e correlação entre a
   voz e o acompanhamento antes de chegar ao navegador.

MDX-Net é uma opção apropriada para demixing musical, enquanto AudioSep é uma
opção mais ampla para consultas como “fala humana” ou “aplausos”. AudioSep
exige uma pilha maior e, por isso, fica fora do perfil CPU inicial. O ensemble
deve ser ativado por feature flag após um benchmark com amostras reais; não há
fallback silencioso para outra trilha se o segundo modelo falhar.

## Hospedagem sem RunPod

O Hostear público oferece VPS CPU (por exemplo, 4 vCPU/8 GB/100 GB NVMe por
aproximadamente R$ 99,99/mês). Isso é suficiente para API, fila de um job,
cache de pesos e o perfil `fast`; o perfil `quality` pode continuar no mesmo
servidor, porém com latência maior. A página pública não anuncia GPU, então não
devemos presumir que um ensemble MDX/RoFormer terá desempenho interativo ali.

Arquitetura recomendada no Hostear:

- um processo Uvicorn e um job de separação por vez;
- cache Demucs em volume persistente;
- `AUDIO_MODEL_OFFLINE=1` depois do preflight;
- retenção curta dos WAV e limpeza automática;
- fila explícita para lotes, sem iniciar um segundo processo para “acelerar”.

Se o provedor oferecer um plano GPU privado, ele deve ser cotado diretamente
com o Hostear. Até essa confirmação, não há necessidade de RunPod para colocar
esta fase em produção.

## Cenário RunPod apenas para comparação

Os números abaixo são compute bruto, sem armazenamento, tráfego ou impostos.
Usam as tarifas públicas consultadas em 2026-09-09 e devem ser recalculados
antes de uma compra.

| Cenário | Tarifa usada | 10 min | 1 h | 8 h |
| --- | ---: | ---: | ---: | ---: |
| Pod A40 | US$ 0,49/h | US$ 0,08 | US$ 0,49 | US$ 3,92 |
| Pod RTX 4090 | US$ 0,74/h | US$ 0,12 | US$ 0,74 | US$ 5,92 |
| Serverless A40/A6000 flex | US$ 1,22/h equivalente | US$ 0,20 | US$ 1,22 | US$ 9,76 |

Como referência para um lote de 100 vídeos de até 3 minutos: se o ensemble
levar de 0,5× a 1,5× a duração total, são 2,5–7,5 horas de GPU. Isso dá
aproximadamente US$ 1,23–3,68 em um Pod A40 ou US$ 3,05–9,15 no Serverless
flex, antes de armazenamento e rede. É uma faixa de planejamento, não uma
promessa de tempo: o benchmark do modelo, tamanho do áudio e cold start mudam
o resultado.

## Regra operacional de custo

Nenhum Pod ou endpoint RunPod foi criado para esta fase. Se um benchmark for
autorizado no futuro, usar primeiro Serverless com mínimo de workers igual a
zero, executar o lote, conferir os artefatos e então apagar o endpoint e o
volume. Para Pod, parar **e** terminar a máquina; volumes persistentes também
devem ser removidos. Confirmar no painel que não há Pods, workers ou volumes
ativos antes de encerrar o teste.

Referências: [Demucs](https://github.com/facebookresearch/demucs),
[AudioSep](https://github.com/Audio-AGI/AudioSep),
[MDX-Net](https://arxiv.org/abs/2111.12203),
[RunPod pricing](https://www.runpod.io/pricing),
[RunPod serverless pricing](https://docs.runpod.io/serverless/pricing) e
[Hostear](https://www.hostear.com.br/).
