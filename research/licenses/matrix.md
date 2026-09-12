# Matriz de licenças por artefato

## Adendo — Experimento 3, 11/09/2026

Auditados 23 arquivos locais (pesos/configurações), com SHA-256; oito arquivos
possuem ETag LFS coincidente. Evidências fixadas em
`G:/dowloand/teste/experiment-3-alternative-inpainting-20260911/license-evidence/`.
O ensaio parou por RAM durante inicialização; não houve inferência nem integração.

| Componente | Evidência adicional | Conclusão limitada |
|---|---|---|
| DiffuEraser pesos | card no SHA `ad510dca07fa8e155d4bd8d002085bb8ec8f60e5` declara Apache-2.0 | não cobre todos os terceiros |
| SD1.5 componentes | card no SHA `451f4fe16113bff5a5d2269ed5ad43b0592e9a14` declara CreativeML OpenRAIL-M | condições próprias; não tratar como Apache |
| VAE ft-mse | card no SHA `31f26fdeee1355a5c34592e401dd41e45d25a493` declara MIT | declaração do card vinculada ao snapshot local |
| PCM checkpoint sd15 2step | snapshot `39560fead4ce00f94db3cb8e93dd8fba90ec0be6`, sem concessão explícita no card | licença específica do checkpoint continua UNKNOWN |
| PCM código | Apache-2.0 no commit `b127277f641f28ad2459647a05f78133e5b3fd34` | não extrapolar para pesos |
| BrushNet código | Apache-2.0 no commit `0f9d9e54ca85c40a11a8f0504b4b5b2e7e8fd14d` | ramo incorporado no DiffuEraser deve manter atribuições |
| ProPainter prior | README DiffuEraser mantém termos do prior; licença S-Lab consultada | autorização comercial específica não demonstrada |

Fontes completas, textos arquivados e hashes em `license-evidence/sources.json`.
Conclusão: nenhuma liberação comercial da cadeia inteira. Preservar distinção
entre modificação/redistribuição de código, pesos e direitos de datasets.

## Matriz anterior

Consulta: 10/09/2026. Esta é uma matriz de evidências, não uma liberação automática.
`UNKNOWN` exige recuperar a licença do artefato exato. Regras de atribuição e
redistribuição continuam aplicáveis mesmo em licenças permissivas.

| Tecnologia | Código | Modelo/pesos | Dataset | Dependências | Uso comercial / redistribuição / modificação |
|---|---|---|---|---|---|
| ProPainter | S-Lab 1.0 [1] | Pesos distribuídos pelo projeto; autorização comercial específica não comprovada | UNKNOWN por dataset | RAFT e componentes com avisos próprios | Concessão padrão não comercial; autorização específica necessária para comercial; preservar avisos |
| DiffuEraser | Apache-2.0 [2] | Card próprio Apache; SD/VAE/PCM/prior separados [3] | UNKNOWN | ProPainter explicitamente mantém licença própria | Não liberar cadeia inteira pela licença do wrapper |
| RAFT | BSD-3-Clause [4] | Termos dos checkpoints específicos pendentes | Sintel/KITTI/Things/Chairs com termos próprios | Extensões CUDA e bibliotecas | Código permite usos sob condições BSD; pesos/dados ainda precisam de revisão |
| STTN | MIT no arquivo consultado [5] | Checkpoint/export ONNX: UNKNOWN | UNKNOWN | PyTorch e bibliotecas | Código permissivo com avisos; não transfere automaticamente permissão ao export |
| LaMa | Apache-2.0 [6] | Carve declara Apache-2.0 no model card [13]; vincular SHA do export local | UNKNOWN | Bibliotecas e export ONNX separados | Código/card permissivos condicionados; confirmar identidade do arquivo efetivo |
| SAM2 | Apache-2.0 [7] | README inclui checkpoints Apache-2.0 | SA-V: termos separados, não confundir com licença do código de avaliação | cc_torch BSD; fontes da demo OFL | Código/checkpoints com termos Apache; revisar dataset e terceiros |
| E2FGVI | CC-BY-NC-4.0 [8] | Revisar checkpoint, sem presumir exceção comercial | UNKNOWN | Demais componentes separados | Não comercial; modificação/redistribuição condicionadas à licença |
| FuseFormer | UNKNOWN na coleta | UNKNOWN | UNKNOWN | UNKNOWN | Não assumir permissão por repositório público |
| Focal Transformer | MIT [9] | Checkpoints por tarefa: UNKNOWN | ImageNet/COCO/ADE20K separados | Frameworks próprios | Código permissivo; não é engine pronto de remoção |
| VideoPainter | Custom acadêmica/pesquisa/educação [10] | Texto inclui parâmetros e pesos; CogVideoX separado | UNKNOWN | CogVideoX com termos próprios | Restringe uso comercial/produção; autorização de outro componente não elimina essa restrição |
| Cutie | MIT no núcleo [11] | Checkpoint exato pendente | UNKNOWN | RITM; demo usa outros projetos | Núcleo permissivo; analisar cadeia da demo/pesos |
| RapidOCR / PaddleOCR | Apache-2.0 nos branches consultados [14][15]; release local ainda precisa de vínculo | PP-OCR/ONNX exatos pendentes | UNKNOWN | ONNXRuntime/Paddle | Código permissivo sob condições; completar vínculo de versões/pesos |
| SD1.5 / VAE / PCM / BrushNet | Projetos distintos | Snapshots efetivamente usados ainda não auditados | UNKNOWN | Parte da cadeia DiffuEraser | Não afirmar que Apache no DiffuEraser libera todos os modelos |
| Vmake | Proprietário | Proprietário | Entrada/saída regidas pelos termos | Serviço externo | Adendo de IA §5 restringe uso para melhorar outro serviço de IA [12] |

## Fontes

1. [ProPainter LICENSE](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/LICENSE).
2. [DiffuEraser LICENSE](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/LICENSE) e [exceções no README](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/README.md).
3. [DiffuEraser model card](https://huggingface.co/lixiaowen/diffuEraser).
4. [RAFT LICENSE](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/LICENSE).
5. [STTN LICENSE](https://github.com/researchmm/STTN/blob/f39f62c5bbbe3e3eba084c487353a2c651bfdcde/LICENSE).
6. [LaMa LICENSE](https://github.com/advimman/lama/blob/786f5936b27fb3dacd2b1ad799e4de968ea697e7/LICENSE).
7. [SAM2 README, License](https://github.com/facebookresearch/sam2/blob/2b90b9f5ceec907a1c18123530e92e794ad901a4/README.md).
8. [E2FGVI LICENSE](https://github.com/MCG-NKU/E2FGVI/blob/709cbe319edc21b8a365a28e14cba595a93d62cf/LICENSE).
9. [Focal Transformer LICENSE](https://github.com/microsoft/Focal-Transformer/blob/57bb3031582a2afb2d2a6916612bc4311316f9fc/LICENSE).
10. [VideoPainter LICENSE](https://github.com/TencentARC/VideoPainter/blob/main/LICENSE), branch mutável consultado; SHA ainda pendente.
11. [Cutie LICENSE](https://github.com/hkchengrex/Cutie/blob/main/LICENSE), branch mutável consultado.
12. [Vmake Terms of Service](https://vmake.ai/terms-of-service), edição indicada: 1 de junho de 2026.
13. [Carve/LaMa-ONNX model card](https://huggingface.co/Carve/LaMa-ONNX).
14. [RapidOCR LICENSE](https://github.com/RapidAI/RapidOCR/blob/main/LICENSE).
15. [PaddleOCR LICENSE](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE).

## Próxima auditoria

Para cada deploy candidato, arquivar identidade do artefato, SHA, origem oficial,
texto aplicável e dependências transitivas. Não usar `available()` de um provider
como evidência de licença. Não baixar pesos apenas para preencher esta matriz.
Datasets de avaliação não herdam a licença do software que os lê.
