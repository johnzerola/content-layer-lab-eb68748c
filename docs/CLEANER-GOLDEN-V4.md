# CLEANER_GOLDEN_V4

Estado: **GOLDEN CANDIDATE CONGELADO**  
Data: 12/09/2026

Este contrato identifica a configuração combinada que passou no smoke Pedro de
5 s. Qualquer mudança exige outro nome de candidato e nova validação; não se
altera `CLEANER_GOLDEN_V4` silenciosamente.

| Campo | Valor congelado |
|---|---|
| revisão | `scene-roi-v4` |
| perfil | `legacy_refined` / `legacy_refined_b2_v1` |
| engine | `diffueraser` (`diffueraser-official`) |
| preset / modo | `max` / `subtitle` |
| máscara | dinâmica por quadro; inferência larga e composição seletiva |
| faixa mínima de legenda | 58% da largura × 5,2% da altura; `grow=0.008` |
| política | `scene-local-dual-subtitle-masks-v1` |
| junções | `subtitle-junctions-v1`, habilitado |
| proteção/verificação | `protect_subject=false`, `verify=true` no contrato pago aprovado |
| acabamento global | desligado |
| DiffuEraser | lado 960; dilatação 4; ref stride 5; vizinhança 12; subvídeo 50 |
| composição | apenas dentro da seleção; fora dela vem do original |
| master | `libx264rgb`, CRF 0, `gbrp` |
| delivery | H.264 CRF 16, `yuv420p`; áudio copiado quando compatível |
| commit | `5fa3a4875d525b31d871a81d0e3d6e8661fb7f86` |
| imagem | `docker.io/nivaldo12/leaneria-runpod@sha256:5e7ac6bd84854b7f863714156f6f75f61ab8e0c614078c1401a354f7016c4370` |

O fixture executável está em `backend/app/golden_v4.py`; o teste correspondente
falha se engine, perfil, faixas, parâmetros do adaptador, composição, encode,
commit ou digest forem alterados sem revisão explícita.

O smoke aprovado removeu os resíduos verde-neon do Pedro: V4 anterior tinha
159.607 pixels em 26 frames; Golden V4 teve zero, igual à referência VMake nesse
descritor. O master preservou exatamente os pixels decodificados fora das duas
seleções congeladas.

Limite conhecido: a execução confirmou o candidato combinado. A contribuição
causal isolada de DiffuEraser puro contra `subtitle-junctions-v1` permanece dívida
técnica porque os artefatos puros não foram transferidos.
