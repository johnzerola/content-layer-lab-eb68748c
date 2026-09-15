# Integração Bandit V2 — 15/09/2026

Estado: **INTEGRAÇÃO LOCAL TESTADA / ATIVAÇÃO PÚBLICA PENDENTE**.

O usuário aprovou a escuta do teste A no vídeo ELBSN completo: fala sobre música cantada, sem fornecer a gravação de referência. Aprovação específica desse vídeo, não benchmark universal.

## Implementação

`app/audio_separation.py` seleciona `AUDIO_SEPARATION_ENGINE=bandit` explicitamente. Sem essa variável permanece Demucs. O fluxo mantém upload autenticado, slot único, cancelamento, estado persistido e downloads voice/music. Jobs Bandit registram `engine=bandit`, `model=v2-multi`; downloads continuam funcionando após mudar a configuração do servidor.

`app/bandit_worker.py` carrega o checkout e pesos verificados por revisão e SHA256, sem downloads na requisição. Mesma inferência FP32 e duas threads do piloto; native speech vira diálogo, music + effects vira música/ambiente. Nenhum ensemble, gate ou limpeza Demucs é aplicado. Erro de modelo não causa fallback silencioso.

Entrada nativa preservada em 48 kHz quando recebida nessa taxa; saídas do endpoint convertidas para WAV float 44,1 kHz, compatível com o editor. O preparador atual do navegador ainda envia 44,1 kHz; não se afirma identidade bit a bit com o piloto. Cancelamento mata o subprocesso; arquivos incompletos não são disponibilizados. Reserva de espaço aumentada para 512 MiB por job Bandit para os intermediários.

## Evidência

- Smoke local autenticado com quatro segundos reais: upload, Bandit CUDA, status completed e download das duas faixas passaram; suíte junto com regressões: 16 passaram em 136,37 s. Esse tempo inclui toda a suíte e contenção local, não é latência isolada da engine.
- Depois do ajuste de preservação de sample rate: 18 testes passaram, um smoke real opcional omitido; nova execução real deve usar `BANDIT_SMOKE_INPUT`.
- Testes verificam indisponibilidade sem pesos e recuperação de download após alteração de engine.
- Tentativa CPU, quatro segundos: interrompida após mais de seis minutos sem resultado. Houve concorrência local; não extrapolar tempo de vídeo completo nem atribuir esse número à Hostear.
- SSH `root@104.234.186.50`, BatchMode: recusado (publickey,password). Nenhuma alteração remota realizada.

## Implantação preparada

`backend/Dockerfile.bandit-patch` exige a imagem atualmente em execução como BASE_IMAGE; preserva o runtime existente e volta ao usuário cleaner. Fornecer o peso validado em `bandit-model/checkpoint-multi.ckpt` no contexto temporário de build, fora do Git. O checkout upstream permanece intacto com LICENSE. Dependências torch/numpy/soundfile já devem existir na imagem base; build falha se ausentes.

`backend/docker-compose.bandit.yml` é overlay adicional, não substitui overlays atuais. `BANDIT_IMAGE` deve ser a imagem candidata testada. Não ativado: falta smoke CPU no host e verificação de capacidade/tempo. Antes de ativar, preservar imagem/configurações atuais, verificar jobs ativos e executar smoke isolado sem reiniciar o serviço existente. Guardar rollback para a imagem e lista original de overlays.

Alternativa para desempenho: Hostear mantém autenticação e jobs, processamento ocorre em worker GPU. A integração de transporte para GPU externa/PC ainda não foi implementada; não expor o PC diretamente nem contratar GPU sem orçamento. A variável BANDIT_DEVICE=cuda serve para um backend que já tenha GPU e runtime disponíveis.

## Licenças e atribuição

| Item | Fonte | Autor | Versão | Licença | Uso comercial / atribuição |
|---|---|---|---|---|---|
| bandit-infer | https://github.com/openmirlab/bandit-infer | Karn Watcharasupat e colaboradores; manutenção Paul Yu | 7ec03cb568811958db65a96a10fdb8879922b2ac | Apache-2.0 | ALLOWED; preservar LICENSE/avisos no checkout distribuído |
| checkpoint-multi.ckpt | https://zenodo.org/records/12701995 | Karn Watcharasupat, Chih-Wei Wu, Iroro Orife | v1 | CC-BY-SA-4.0 | ALLOWED; pesos intactos, atribuição no notice da API e provenance.json; acrescentar créditos visíveis no editor antes da ativação pública |

SHA256 dos pesos: `abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc`. Licenças separadas de código e pesos; nenhum dataset adicionado. A distribuição/adaptação dos pesos deve preservar os termos ShareAlike. Modelo Facing the Music NC não incluído.

Próximo: obter acesso SSH, avaliar execução no host ou configurar worker GPU, terminar créditos visíveis e smoke do editor publicado antes de anunciar disponibilidade.
