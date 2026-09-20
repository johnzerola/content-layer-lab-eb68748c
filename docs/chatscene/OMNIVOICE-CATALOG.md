# Catálogo de vozes próprias para ChatScene

O OmniVoice entra como provedor **adicional**. Presets antigos e o clonador Chatterbox não são substituídos. Há 18 **candidatos de identidade**, agrupados por faixa etária e narração; isso não significa 18 vozes prontas. Os controles de atuação continuam separados da identidade.

## Licença: condição anterior à instalação dos pesos

O [código](https://github.com/k2-fsa/OmniVoice) é Apache 2.0; o [checkpoint público](https://huggingface.co/k2-fsa/OmniVoice) é CC-BY-NC. Uma autorização comercial privada precisa cobrir explicitamente os pesos, geração de áudio para usuários do SaaS, local de hospedagem, prazo e eventual redistribuição. Guarde o documento fora do repositório. Não use o modelo publicado no produto enquanto isso não for conferido. O script de instalação exige um checkpoint **já obtido legitimamente** e o caminho de um documento de concessão; ele não baixa pesos nem verifica juridicamente o conteúdo do documento.

## Preparação do serviço, após verificar a concessão

No servidor Linux, a partir do repositório atualizado:

```bash
bash scripts/install-chatscene-omnivoice.sh /opt/chatscene-voice /caminho/privado/checkpoint /caminho/privado/concessao.pdf
```

Configure `CHATSCENE_OMNIVOICE_MODEL_PATH`, `CHATSCENE_OMNIVOICE_PYTHON_PATH`, `CHATSCENE_OMNIVOICE_CATALOG_DIR` e, se diferente do padrão, `CHATSCENE_OMNIVOICE_WORKER` e `CHATSCENE_OMNIVOICE_CATALOG_FILE`. Atualize `service.py` pelo mesmo processo de publicação do serviço de voz atual e reinicie esse serviço. Mesmo com os arquivos presentes, o serviço exige `CHATSCENE_OMNIVOICE_LICENSE_APPROVED=1`, a ser configurado **somente depois da verificação da concessão**. O endpoint autenticado `/v1/voice/health` só anuncia perfis aprovados cujos arquivos `.pt` e `.wav` existem. Um serviço antigo não anunciará nenhum perfil; a interface os manterá desabilitados.

## Criar uma identidade reutilizável

Para cada candidato, `prepare` gera uma amostra PT-BR a partir de atributos de gênero, idade e altura vocal, e guarda um prompt de clonagem reutilizável. A amostra é para **revisão**, não para publicação automática:

```bash
/opt/chatscene-voice/omnivoice-venv/bin/python /opt/chatscene-voice/omnivoice_catalog.py prepare --model-path /caminho/privado/checkpoint --output /opt/chatscene-voice/omnivoice/catalog --voice omni-bia
```

Escute a amostra, confirme pronúncia brasileira, faixa etária percebida, inteligibilidade e que ela soe distinta das demais. Refaça ou rejeite qualquer amostra insatisfatória. Após revisão humana:

```bash
/opt/chatscene-voice/omnivoice-venv/bin/python /opt/chatscene-voice/omnivoice_catalog.py approve --output /opt/chatscene-voice/omnivoice/catalog --voice omni-bia
```

O arquivo `approved.json` libera somente perfis revisados. A geração usa sempre o prompt salvo para reduzir deriva de timbre entre falas. Não há treinamento por personagem. A capacidade de distinguir vozes, o sotaque PT-BR e a latência **ainda precisam ser medidos em áudio real**; idade e tom no `instruct` são pedidos ao modelo, não garantias. O backend alterna o worker OmniVoice e o worker de clonagem Chatterbox para não manter os dois modelos carregados simultaneamente no VPS.

“Voz rouca” não é um atributo documentado do Voice Design do OmniVoice. Só inclua esse rótulo no catálogo se uma amostra própria e autorizada produzir rouquidão convincente de forma estável; alterar apenas o pitch não atende a esse requisito.

## Aceite antes de marcar pronto

Teste pelo menos uma amostra de cada grupo, mensagens curtas e longas, alternância entre personagens, mesma voz em 10 falas, duração real no preview, áudio normalizado, falha do serviço e carga simultânea. Compare diversidade por escuta cega; não conte nomes ou combinações de atributos como vozes distintas sem essa prova. Só então aprove novos IDs e publique a interface.
