# Licenças dos modelos usados pelo Clean Engine

O Clean Engine só executa um provider quando a licença dele permite o uso
pretendido. Providers marcados como **não comercial** ficam desativados por
padrão e exigem `CLEANER_ALLOW_NONCOMMERCIAL=1`.

| Provider | Modelo | Licença | Uso comercial | Observação |
| --- | --- | --- | --- | --- |
| `temporal` (TBE) | algoritmo próprio (OpenCV) | Apache-2.0 (OpenCV) | Sim | Sem pesos externos. |
| `ocr` | RapidOCR / PP-OCR (ONNX) | Apache-2.0 | Sim | Detecção de texto. |
| `lama` | Carve/LaMa-ONNX (`lama_fp32.onnx`) | Apache-2.0 (export Carve) | Sim | Pesos originais LaMa: CC BY-NC-SA 4.0. O export Carve é publicado sob Apache-2.0; ainda assim, valide com seu jurídico antes de uso comercial. |
| `sttn` | STTN (export ONNX `sttn.onnx`) | Apache-2.0 | Sim | Motor temporal rapido para faixas largas; sem pesos, o provider fica inativo. |
| `propainter` | ProPainter | S-Lab License 1.0 | **Não** | Somente pesquisa/uso não comercial. Desativado por padrão. |
| `diffueraser` | DiffuEraser | S-Lab / Stable Diffusion CreativeML | **Não** | Desativado por padrão. |

## Regras

1. Nenhum provider não comercial pode ser ativado em produção paga.
2. Ao adicionar um provider novo, registre-o nesta tabela **antes** de habilitá-lo.
3. A ferramenta é destinada a vídeos próprios ou conteúdo autorizado.

## SAM2 (Segment Anything Model 2) — ONNX

- Origem: Meta AI, `facebook/sam2`.
- Licença: **Apache 2.0** (checkpoints Hiera; conferir a variante exportada).
- Uso no projeto: segmentação promptável do modo `object` (clique/caixa do usuário).
- Status: **liberado para uso comercial**, carregado por `CLEANER_SAM2_ENCODER` /
  `CLEANER_SAM2_DECODER`. Sem pesos, o motor usa o fallback GrabCut (OpenCV,
  BSD-3) — sempre disponível e também comercialmente livre.
