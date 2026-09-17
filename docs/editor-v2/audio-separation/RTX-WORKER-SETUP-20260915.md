# Worker Bandit na RTX 2060

O código do Editor V2 já aceita Bandit, mas a Hostear sem GPU permanece no Demucs. Este procedimento executa o mesmo backend de áudio no seu PC, usando CUDA, sem abrir uma porta no roteador.

## Preparar a sessão

O peso não fica no Git. Use o checkout e o checkpoint já validados no piloto ou forneça caminhos equivalentes. No PowerShell:

```powershell
& C:\Users\DINO\content-layer-lab\backend\scripts\run_bandit_gpu_worker.ps1 `
  -StorageDirectory 'G:\dowloand\teste\bandit-gpu-storage' `
  -PublicHostname 'seu-hostname-do-tunel'
```

Substitua somente o hostname pelo endereço atual do túnel, sem `https://`. O iniciador lê `CLEANER_WORKER_SECRET` do `.env.local` na raiz do projeto quando a sessão não tem um segredo válido. Não copie valores de exemplo para o segredo. Ele encontra o Python GPU local já instalado; `-Python` permite indicar outro executável explicitamente. `BANDIT_PYTHON`, `BANDIT_CHECKOUT`, `BANDIT_CHECKPOINT` e `BANDIT_STORAGE` também podem ser definidos no `.env.local`. Valores explícitos têm precedência. O arquivo é lido como dados, sem executar seu conteúdo nem imprimir o segredo.

Use `-CheckOnly` para validar a configuração sem iniciar outro servidor. Se a porta estiver ocupada, o iniciador informa o PID e pede para parar o processo na janela que mostra os acessos `GET /v1/audio` e `POST /v1/audio`; a janela do túnel é diferente e deve continuar aberta. Uma janela nova do PowerShell não herda variáveis definidas em outra janela.

O script valida espaço em disco, CUDA, FFmpeg, numpy, soundfile, uvicorn, o checkout e a existência do checkpoint. Ele inicia uma aplicação isolada só de áudio, portanto não exige OpenCV, OCR ou os modelos de vídeo. O serviço escuta somente `127.0.0.1:8095`. Por padrão, o áudio original e as saídas ficam em `bandit-gpu-storage` ao lado da pasta do checkout Bandit. Use `-StorageDirectory` ou `BANDIT_STORAGE` para escolher outro destino.

### Erro 507: espaço insuficiente no worker

`ready=true` em `/v1/audio/capabilities` confirma a disponibilidade do modelo, mas não garante espaço para receber um job. O upload exige a reserva `CLEANER_MIN_FREE_GB` (10 GiB por padrão) mais 0,5 GiB para Bandit. A verificação ocorre antes da criação do job; por isso não aparece uma nova pasta quando o upload é recusado.

Pare o worker com **Ctrl+C na janela que o iniciou** e reinicie usando um disco com espaço:

```powershell
& C:\Users\DINO\content-layer-lab\backend\scripts\run_bandit_gpu_worker.ps1 `
  -StorageDirectory 'G:\dowloand\teste\bandit-gpu-storage'
```

Mantenha o túnel apontando para a porta 8095 e forneça `-PublicHostname` ao usar uma sessão nova. O script imprime o destino e o espaço livre antes de iniciar. O Editor V2 mostra a etapa atual e mantém o erro junto ao botão caso o upload seja recusado. Alterar o destino não move nem apaga jobs antigos; aguarde jobs em andamento antes de trocar a pasta.

## Ligar ao Editor V2

Para a aplicação publicada alcançar o PC, crie um túnel de saída autenticado (Cloudflare Tunnel ou equivalente) apontando para `http://127.0.0.1:8095`. Não faça port-forward direto e não coloque `CLEANER_WORKER_SECRET` no frontend. Depois, altere no ambiente server-side da aplicação as variáveis `CLEANER_WORKER_URL` e `CLEANER_WORKER_PUBLIC_URL` para o hostname HTTPS do túnel e publique uma nova versão.

Faça primeiro um smoke autenticado: `/v1/audio/capabilities` deve retornar `ready=true`, `engine=bandit`, `device=cuda`. Em seguida use um trecho curto no Editor V2 e confirme as duas faixas antes de usar vídeos longos.

## Operação

O PC precisa permanecer ligado e conectado enquanto um job estiver processando. Se o PC desligar ou o túnel cair, o job falha e o original permanece preservado; o Demucs da Hostear não é alternado automaticamente. Para voltar ao servidor CPU, remova as duas URLs do ambiente web e publique novamente.

### Iniciar sem deixar o PowerShell aberto

Use um Cloudflare Tunnel **nomeado**, com hostname fixo, em vez do endereço temporário `trycloudflare.com`. No painel Cloudflare, crie o túnel, publique um hostname HTTPS apontando para `http://127.0.0.1:8095` e instale o conector como serviço do Windows com o comando fornecido pelo próprio painel. Depois atualize `CLEANER_WORKER_URL` e `CLEANER_WORKER_PUBLIC_URL` no Lovable uma única vez com esse hostname fixo.

Com o hostname definido, registre o Bandit para iniciar oculto no logon e reiniciar automaticamente se falhar:

```powershell
Set-Location C:\Users\DINO\content-layer-lab
.\backend\scripts\install_bandit_gpu_autostart.ps1 `
  -PublicHostname 'audio.seudominio.com' `
  -StartNow
```

O segredo não é salvo nos argumentos da tarefa: o iniciador o carrega de `.env.local`. Os logs ficam em `backend/storage/bandit-gpu/logs`. Para consultar ou remover:

```powershell
Get-ScheduledTask -TaskName 'VaiViral Bandit GPU Worker'
.\backend\scripts\install_bandit_gpu_autostart.ps1 `
  -PublicHostname 'audio.seudominio.com' `
  -Remove
```

O modo automático elimina as duas janelas abertas, mas o PC ainda precisa estar ligado, conectado e com o usuário do Windows autenticado para a RTX processar. Para disponibilidade mesmo com o PC desligado, use uma GPU em nuvem no lugar deste worker local.

O teste de referência processou 80 segundos em 125,6 s na RTX 2060. Isso é uma referência local, não uma garantia de latência: carregamento do modelo, temperatura, outros aplicativos e múltiplos jobs alteram o tempo. O backend limita a um job por vez.

## Licença

Bandit V2 usa código Apache-2.0 e checkpoint CC-BY-SA-4.0. Preserve os avisos e a atribuição documentados em [BANDIT-INTEGRATION-20260915.md](BANDIT-INTEGRATION-20260915.md). Não redistribua o checkpoint dentro deste repositório.
