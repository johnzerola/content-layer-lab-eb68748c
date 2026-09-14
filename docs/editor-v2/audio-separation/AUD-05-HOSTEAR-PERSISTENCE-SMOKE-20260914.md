# AUD-05 — Hostear autenticada e persistência durável

Data: 14/09/2026

Estado: **REMOTE_WORKER_SMOKE_PASS / DATABASE_MIGRATION_READY_NOT_DEPLOYED**

## Smoke autenticado

`scripts/audio_authenticated_smoke.py` executou o contrato real da Hostear usando tickets HMAC v2 com escopo. O script consultou capacidades, enviou o WAV, iniciou o job, observou `processing → completed`, baixou as duas trilhas e validou cada saída com FFprobe/FFmpeg. Nenhum token foi escrito no relatório.

Entrada: áudio completo extraído de `VMAKE.IA.mp4`, 4,928005 s, estéreo, PCM float32 a 44,1 kHz.

| Medida | Resultado |
|---|---:|
| job | `fb249b0d-bfed-41f9-b8ac-3aaf376365f3` |
| autenticação | `scoped_hmac_v2` |
| motor remoto | Demucs `htdemucs` em CPU |
| limite anunciado | 180 s / 64 MiB |
| tempo observado total | 21,902 s |
| diálogo | MP3, estéreo, 44,1 kHz, 4,96325 s |
| música | MP3, estéreo, 44,1 kHz, 4,96325 s |

Classificação: `AUTHENTICATED_REMOTE_SMOKE_PASS`. Isso valida protocolo e arquivos; a qualidade neural foi registrada como `NOT_JUDGED_BY_TECHNICAL_SMOKE`.

Relatório sanitizado: `output/audio-separation/vmake-ia-hostear-auth-smoke-20260914/report.json`.

## Persistência implementada

A migração `supabase/migrations/20260914090000_audio_separation_jobs.sql` cria ownership por usuário, contrato de origem imutável, máquina de estados, revisão de resultado, RLS e validação do prefixo privado de armazenamento. Um job só pode entrar em `completed` depois de possuir as duas chaves e duração.

O cliente agora:

1. registra o job antes do upload;
2. grava estados reais sem persistir tickets;
3. salva Diálogo e Música no bucket privado sob `{user}/audio-jobs/{job}/`;
4. conclui o registro apenas quando os dois uploads existem;
5. restaura stems do armazenamento da conta quando o IndexedDB local não os contém;
6. pode reemitir tickets curtos de controle/resultado após recarregar.

## Gate externo

A migração está pronta e testada localmente, mas ainda não foi aplicada ao Supabase conectado. Até esse deploy, a nova interface não deve ser anunciada como retomada durável em produção. O worker Hostear não foi alterado por este teste.
