# AUD-00 — baseline inicial

Estado: IN_PROGRESS / INITIAL_ENGINEERING_CONTROLS_PASS. 13/09/2026.

27 testes passaram: seis proporções de entrada, controles de mistura, troca,
zero, vazamento, ganho, atraso/drift, silêncio, PCM inválido, argumentos CLI,
manifest/hash, falha do processo, timeout, saída ausente, sample rate incorreto,
preservação mono/estéreo a 48 kHz, antifase e métricas com ground truth.
Seis fixtures estéreo float32 foram geradas em output/audio-separation/aud00-controls.
São senoides determinísticas, não fala humana ou qualidade perceptual.

O teste de mute agora exige PCM renderizado; o oráculo foi aceito e a mistura
com música foi recusada. Esse teste auxiliar ainda decodifica mono/44.100 Hz:
não aprova canais, taxa nativa ou paridade completa do editor.

O runner exige manifest com modelo/device explícitos, usa allowlist, tem timeout
por braço, encerra a árvore do processo, não sobrescreve pasta existente e só
retorna sucesso se todos os processos e as duas saídas passam. Valida duração,
taxa, canais, tamanho e hashes. Ainda faltam hashes/licenças de pesos e teste de
cancelamento por solicitação externa. Retorno do processo não aprova qualidade.

Python atual: 3.13.5, NumPy/SciPy/pytest presentes, Demucs ausente. Nenhum modelo
instalado ou inferência executada. Sem mídia humana autorizada identificada.
Baseline neural NOT_RUN; métricas perceptuais null. Não há ganho/custo estimado.

Relatórios A–D registram contratos do serviço/mix, não fornecem neste pacote GT
humano congelado. A Fase 5 declara explicitamente ausência de separação neural.
Os registros históricos foram preservados; o antigo check-muted por RMS não
constitui prova de que a música desapareceu.

Comandos executados:

```powershell
python -m pytest scripts/tests/test_audio_benchmark_controls.py scripts/tests/test_audio_cli_contract.py scripts/tests/test_audio_benchmark_runner.py -q
python scripts/audio_benchmark_controls.py --output output/audio-separation/aud00-controls
```

Próximo: incorporar fontes autorizadas de fala limpa + música e registrar os
pesos/licenças antes do B0 real. O manifest B0 está preparado, não executado.
