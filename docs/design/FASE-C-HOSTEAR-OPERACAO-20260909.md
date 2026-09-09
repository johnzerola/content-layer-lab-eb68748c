# Fase C — operação econômica no Hostear

Esta fase mantém o processamento no VPS Hostear e otimiza previsibilidade,
tempo de fila e custo. Nenhum recurso GPU externo é necessário para o perfil
`fast`.

## Configuração ativa

- Uvicorn com um worker de processo.
- Uma separação de áudio por vez, evitando disputa de RAM.
- Cache Demucs persistente em `/app/models/demucs-hf`.
- `AUDIO_MODEL_OFFLINE=1` após o preflight do cache.
- `AUDIO_SEPARATION_THREADS=2` para a capacidade CPU validada.
- Timeout de 900 segundos e limpeza de jobs expirados.
- Ensemble MDX desligado por padrão.

O serviço agora expõe no endpoint de capacidades o número de threads, timeout,
perfil e disponibilidade do ensemble. Jobs concluídos registram
`processing_seconds`, permitindo medir tempo real no Hostear em vez de estimar
por hardware teórico.

## Como acelerar sem GPU

1. Reutilizar o cache de pesos; o download inicial não pode ocorrer durante um
   lote.
2. Extrair o áudio uma única vez e separar somente WAV 44,1 kHz.
3. Usar `fast` para prévia e `quality` somente no export final.
4. Manter uma fila única; executar vários Demucs simultaneamente em 4–8 GB
   costuma trocar velocidade por paginação e falhas.
5. Medir `processing_seconds` por duração de áudio e ajustar threads somente
   depois de um teste controlado.

## Preflight antes de atualizar

```sh
docker compose -f docker-compose.audio.yml ps
curl -fsS https://SEU_WORKER/v1/health
curl -fsS https://SEU_WORKER/v1/audio/capabilities
python scripts/benchmark_audio_separation.py amostra.wav --output .audio-benchmark
```

O benchmark deve ser executado com uma amostra autorizada e curta. A ativação
do ensemble só é aprovada se o ganho perceptível superar o tempo adicional e
as duas trilhas mantiverem duração, pico e ausência de clipping.

## Rollback e limpeza

Atualizar somente a imagem/overlay do worker de áudio, preservar o compose base
e manter a imagem anterior identificada para rollback. Depois de um teste,
remover amostras temporárias e conferir que não há processo Demucs filho.
Como não há RunPod nesta fase, não existe GPU para deixar ligada nem volume
externo gerando cobrança.
