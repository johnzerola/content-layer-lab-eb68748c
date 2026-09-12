# SEDiT

Zheng Hui e Yunlong Bai, 2026. [SEDiT: Mask-Free Video Subtitle Erasure via One-step Diffusion Transformer](https://arxiv.org/abs/2605.14894).

O abstract propõe remoção de legendas sem máscara explícita em um passo de
difusão. A motivação é evitar dependência da segmentação numa edição localizada.
Descreve condicionamento ocasional por primeiro frame limpo para continuidade
entre segmentos e inferência em chunks. As alegações de resolução e velocidade
são dos autores, não resultados do Cleaner.

Relevância: uma alternativa para estudar erros de detecção/máscara, depois das
ablações dos engines existentes. Também exige medir alteração fora do texto e
controle sobre qual classe de texto remover. Arquitetura e treino completos,
pesos, licença, VRAM e reprodução ainda precisam de auditoria; nenhum ganho ou
permissão comercial é assumido. Status: descoberta recente para próxima rodada.
