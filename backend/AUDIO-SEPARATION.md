# Separar fala/voz do acompanhamento — Demucs

## Escolha open source (consulta 2026-09-08)

- [Demucs mantido pelo autor](https://github.com/adefossez/demucs): escolhido,
  pacote 4.1.0, licença MIT, modelo htdemucs, CLI e execução CPU/GPU. O antigo
  repositório facebookresearch foi arquivado; usamos a distribuição atual.
- [Spleeter, Deezer](https://github.com/deezer/spleeter): alternativa real,
  baseada em TensorFlow. Não adicionada: manter dois runtimes sem benchmark
  aumentaria complexidade e tamanho. Não há fallback silencioso entre motores.
- [Demucs CLI](https://github.com/adefossez/demucs/blob/main/demucs/separate.py)
  documenta two-stems=vocals, janelas com overlap, CPU e saída MP3.

Não foi copiado um modelo privado nem prometida qualidade perfeita. A licença
MIT do código está no pacote instalado e no repositório upstream. Conferir
também as condições dos pesos ao substituir o modelo. O modelo escolhido é
de separação musical: a trilha vocals pode incluir canto, além da fala, e
resíduos de instrumentos. Não faz diarização nem identifica a voz do usuário.

## Fluxo implementado

1. App autenticado pede tickets curtos com escopos upload/control/result.
2. Navegador extrai áudio, preserva mono/estéreo e reamostra para WAV 44,1 kHz.
   Não envia a imagem do vídeo para o serviço. Limite inicial 180 s / 256 MB
   no arquivo de entrada do navegador; WAV no servidor limitado a 64 MB.
3. Hostear recebe o WAV validado por FFprobe. Um job por processo API,
   dispositivo CPU explícito, 2 threads de cálculo, máximo 15 minutos.
4. Demucs cria vocals.mp3 e no_vocals.mp3, 192 kbps. Duração e presença de
   ambas são verificadas antes de concluir. O original nunca é sobrescrito.
5. Editor baixa e persiste as duas faixas como data URLs (não URLs temporárias
   de sessão), silencia a mistura original e permite volume, mudo, fade,
   download individual e ouvir somente a voz. Repetir substitui apenas stems
   identificadas, preservando os demais clipes e edições feitas durante a tarefa.
6. Prévia segue a agulha do vídeo. Exportação do editor profissional mistura
   as trilhas e aplica os mesmos cortes do vídeo; uma falha ao carregar uma
   stem aborta, não recoloca silenciosamente a música original.

O antigo separador mid/EQ e a resposta de sucesso simulada foram retirados.
O painel de pré-corte VideoStudio informa onde está a separação real.
O serviço não chama RunPod, não inicia GPUs e não tem repetição automática.
Cancelamento/timeout mata o processo Demucs; arquivos temporários expiram
conforme CLEANER_RETENTION_HOURS. Um upload falho remove só o WAV incompleto.

## Instalação/ativação

Serviço Hostear ativado em 2026-09-08, preservando a imagem anterior e os
arquivos originais. Não foi usada a RunPod. A publicação do frontend no
Lovable é uma etapa separada da atualização deste serviço.

Na pasta backend, a imagem CPU aceita instalação opcional:

```sh
docker build -f Dockerfile.cpu --build-arg INSTALL_AUDIO_SEPARATOR=1 -t cleaner-audio:demucs-4.1.0 .
```

Configurar no **servidor**, preservando as variáveis de autenticação/CORS:

```dotenv
AUDIO_SEPARATION_ENABLED=1
AUDIO_MODEL_CACHE=/app/models/demucs-hf
# Somente depois de preencher/validar o cache:
AUDIO_MODEL_OFFLINE=1
```

Manter /app/models persistente e gravável pelo usuário cleaner. Na primeira
execução, o Demucs baixa seus pesos públicos; podem levar tempo e espaço.
Depois, manter o cache. Testar `python -m demucs.separate --help` na imagem,
baixar/validar os pesos e registrar seu snapshot antes de publicar produção.
Não atualizar pacotes/pesos automaticamente em cada job.

Usar uvicorn com **um processo** (--workers 1), como no Dockerfile.cpu:
o limite de concorrência e os sinais de cancelamento são locais ao processo.
Em escala multiprocesso, migrar a exclusão e estados ativos para Redis/fila.
O app precisa de CLEANER_WORKER_URL/PUBLIC_URL e segredo no ambiente servidor;
nenhuma chave fica no código do navegador. Sem ativação, a UI retorna erro
explícito antes de enviar mídia. O botão atual exige reabrir o painel de áudio
se ele for fechado durante processamento, pois fechar cancela a tarefa.

## Teste real e limites da validação

Instalação isolada no Windows (CPU, sem alterar pacotes globais):
`%TEMP%\cleaneria-audio-demucs-20260908`.
A amostra de 5 s foi extraída do vídeo autorizado em G:\dowloand\teste.
O mesmo adaptador de produção executou Demucs e gerou ambas as faixas em
56,79 s, incluindo o primeiro carregamento. Esse tempo não é um benchmark
da Hostear e não deve ser extrapolado linearmente para vídeos maiores.

Resultados: `G:\dowloand\teste\audio-demucs-20260908`.
Vídeo de escuta `video-5s-voz-separada.mp4`: imagem copiada do original,
áudio substituído pela faixa vocals. Escutar e aprovar qualidade perceptiva;
gerar arquivos válidos não prova isolamento perfeito de fala/música.

Testes automatizados adicionais cobrem WAV estéreo, duração/formato,
autenticação e escopos, recusa de duplicação, limite de concorrência,
cancelamento, falha sem falso sucesso, limpeza e sincronização dos cortes.
O primeiro teste foi local. A validação posterior na Hostear está abaixo.

Verificação local em 2026-09-08: 244 testes Vitest e 83 testes pytest passaram;
TypeScript e build de produção passaram. O MP4 de escuta tem exatamente 5 s,
vídeo H.264 1080×1920 e áudio AAC. A imagem foi copiada sem recodificação.

## Deploy Hostear e navegador — 2026-09-08

- Imagem ativa: `content-layer-lab-cleaner-worker-cpu:audio-demucs-20260908`
  (também etiquetada `latest` para o Compose existente).
- Recuperação: `content-layer-lab-cleaner-worker-cpu:before-audio-20260908` e
  `/opt/cleaneria-audio-20260908/hostear-app-before.tar.gz`.
- Patch só de áudio: `Dockerfile.audio-patch` copia main.py, storage.py e
  audio_separation.py; não publica alterações experimentais do inpainting.
- Overlay: `/opt/cleaner-cpu/docker-compose.audio.yml`, junto dos Compose
  CPU e scene existentes. Não executar o Compose base sozinho para atualizar
  esse serviço, pois isso desabilita as variáveis do áudio.
- Script reproduzível: `scripts/deploy_audio_hostear.sh build`, preflight,
  depois `scripts/deploy_audio_hostear.sh activate` (na release remota).
- Cache persistente Demucs: `/app/models/demucs-hf`; snapshot HTDemucs
  `cbc8a9b1a87023b7fd74e7b3412e6321c0eab003`. Modo offline só no subprocesso
  Demucs, sem alterar os downloads de OCR/outros motores do worker.
- Preflight CPU limitado a 2 CPUs/4 GB: amostra 5 s processada em 18,61 s.
- HTTPS `/v1/audio/capabilities`: ready=true, device=cpu. Consulta de job
  sem token devolveu 401. Worker saudável após os testes, sem filho Demucs.
- Chromium com AudioPanel, extração WAV, upload, polling, download, mixagem
  e exportador reais: duas trilhas recebidas em 24,91 s. Confirmados original
  silenciado, player de voz tocando e música pausada. MP4 exportado com AAC.
- Artefatos: `G:\dowloand\teste\audio-hostear-20260908`, incluindo screenshot,
  stems e `resultado.json`. O export do teste usa 270×480/15fps para rapidez;
  isso é configuração do teste, não redução obrigatória do recurso.
- Esse navegador usa um ticket de teste assinado: login/geração do ticket via
  Supabase e publicação do site Lovable não são cobertos. O substituto fica
  exclusivamente em `tests/browser/vite.audio.config.ts`, nunca no build do app.

Reproduzir o navegador: iniciar Vite com `--config
backend/tests/browser/vite.audio.config.ts`, configurar o segredo apenas no
ambiente do processo e executar `scripts/smoke_audio_browser.py INPUT OUTPUT`
com PYTHONPATH apontando para backend. Nenhum token/segredo é salvo no relatório.
