# Matriz de licenças e risco de adoção

Classificação: **verde** = referência/código geralmente compatível após revisão; **amarelo** = revisar licença, dependências e patentes antes de distribuir; **vermelho** = não incorporar sem licença comercial ou autorização.

| Projeto/dependência | Licença indicada | Classificação | Observação |
|---|---|---:|---|
| OpenCut | MIT | verde | manter atribuição; identidade e marca continuam próprias |
| OpenReel | verificar `LICENSE` do commit escolhido | amarelo | não depender de classificação de agregadores |
| OpenVideo React Video Editor | licença dual com condição por tamanho/uso | amarelo | empresa acima do limite descrito precisa licença comercial |
| Clypra core | MIT | verde | AI/backend e branding proprietário não entram |
| Keyloom | MIT | verde | reutilizar ideias/estrutura, não assets sem licença compatível |
| Captiony | MIT | verde | verificar dependências ao copiar componentes |
| Subtitle editor PWA | MIT | verde | wavesurfer e fontes têm revisão própria |
| react-timeline-editor | MIT | verde | componente genérico; validar acessibilidade e manutenção |
| WaveSurfer | BSD-3-Clause | verde | manter aviso; plugins têm contratos próprios |
| ffmpeg.wasm | MIT + obrigações do build FFmpeg | amarelo | codecs, patentes e distribuição do binário exigem revisão |
| Mediabunny | MPL-2.0 | amarelo | arquivo modificado pode ter obrigações de disponibilização |
| Remotion | licença especial/comercial | vermelho para core | usar apenas após revisão jurídica/licença apropriada |

## Regra de incorporação

Antes de adicionar uma dependência: fixar commit/tag, guardar licença e avisos em `research/licenses/`, rodar auditoria de dependências e registrar quais arquivos foram modificados. Nenhum repositório de referência autoriza copiar a identidade visual do CapCut ou seus assets.
