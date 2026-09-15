# Diálogo e música cantada — comparação A/B

Estado: **A_EXECUTADO / B_AGUARDA_ARQUIVO_DE_REFERENCIA / QUALIDADE_PENDENTE**.

Vídeo usado: `G:/dowloand/spy/ELBSN_Edit_video_no_watermark.mp4`, o mesmo do piloto anterior. O usuário identificou a música como Lady Gaga, Bruno Mars — Die With A Smile. Essa identidade não foi verificada por reconhecimento automático.

## A — sem referência da música

Bandit V2 multi, mesmo checkpoint, revisão e licenças documentados em [piloto anterior](DIALOGUE-SINGING-PILOT-20260915.md). O modelo recebe apenas a forma de onda, sem título, letra ou gravação da música.

Pasta: `G:/dowloand/teste/audio-die-with-a-smile-ab-20260915/A-sem-referencia`.

- Entrada completa: 80,179917 s, estéreo, 48 kHz.
- SHA256 da entrada: `432c153ac37a9e02096a085772464e9c4a2f8c0c6e747ab73ba50b4aec5007d3`.
- GPU local, FP32, 125,610 s incluindo carregamento de 7,422 s.
- Pico CUDA alocado: 4040,917 MiB.
- `dialogue.wav`: saída speech; `music-and-environment.wav`: music + effects.
- Erro relativo de reconstrução: 0,014392. Não mede remoção de canto nem preservação da fala.
- Sem normalização independente; saídas float preservam o sinal do modelo.

O assistente não realizou avaliação auditiva. O usuário deve comparar canto residual, palavras perdidas e naturalidade antes de qualquer promoção. A inferência completa não equivale a ganho aprovado.

## B — referência conhecida

O título sozinho não fornece a forma de onda necessária. Não foi encontrado arquivo local pelo nome da música; o caminho foi solicitado ao usuário. Nenhum resultado B foi gerado.

Foi implementado `backend/scripts/reference_music_pilot.py`: alinhamento por correlação em dois estágios, ganho robusto por canal e subtração da referência contendo canto e instrumentos. Requer WAV mono/estéreo 48 kHz com os mesmos canais da entrada. Recusa cobertura inferior a 95% ou correlação insuficiente em pelo menos 60% das janelas de dois segundos. Esses limiares são experimentais, não calibrados para qualidade perceptual.

Não corrige alterações de velocidade, pitch, remix, reverberação ou compressão variável. Um master diferente pode ser recusado ou deixar resíduos. Mesmo alinhamento aceito exige escuta: pode remover componentes correlacionados com o diálogo. A referência ideal é a mesma gravação usada no vídeo.

Execução, após converter a referência para 48 kHz estéreo com FFmpeg:

```powershell
python backend/scripts/reference_music_pilot.py --input G:/dowloand/teste/audio-die-with-a-smile-ab-20260915/input.wav --reference CAMINHO/reference-48k.wav --output G:/dowloand/teste/audio-die-with-a-smile-ab-20260915/B-com-referencia
```

Validação do algoritmo: três testes passaram, cobrindo atraso/ganho conhecidos, referência errada e NaN. São controles sintéticos; não comprovam separação deste vídeo.

## Continuidade

1. Receber a gravação de referência e executar B.
2. Comparar A/B com o original no mesmo timestamp e volume, especialmente onde fala e canto se sobrepõem.
3. Registrar julgamento de naturalidade e canto residual; manter o vencedor apenas após essa avaliação.

Nenhuma engine de produção ou configuração da Hostear foi alterada. Nenhum recurso pago foi usado.
