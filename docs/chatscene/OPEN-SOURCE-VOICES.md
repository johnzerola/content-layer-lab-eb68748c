# Vozes abertas no ChatScene

O catálogo local usa [Piper](https://github.com/OHF-Voice/piper1-gpl) (GPL-3.0-or-later) e pesos PT-BR [piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR) (MIT; verificar o MODEL_CARD de cada voz). Faber já existia; Cadu e Jeff são vozes-base adicionais. O [Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox) (MIT) continua disponível apenas para referências adultas próprias ou autorizadas. Nenhum modelo é embutido no frontend.

Para habilitar Cadu e Jeff, no host do serviço de voz:

```sh
python backend/chatscene_voice/install_piper_voices.py --directory /opt/chatscene-voice/piper
sudo systemctl restart chatscene-voice
```

O instalador usa revisão e SHA-256 fixos para os pesos. Não executa na publicação do site e não substitui a voz Faber. `GET /v1/voice/health` informa `piperVoices`; opções não instaladas aparecem desabilitadas no editor.

O controle Grave/Original/Fina gera a alteração de tom no servidor por FFmpeg, sem mudar a velocidade de reprodução. Prévia e exportação usam o mesmo arquivo gerado. O endpoint `/v1/voice/transform` precisa estar implantado no serviço privado antes da publicação do frontend; até lá, Grave e Fina ficam desabilitados e os presets existentes seguem pelo caminho antigo. A transformação FFmpeg básica não preserva formantes e tons extremos podem soar artificiais.

Ao redistribuir o runtime Piper, cumprir as obrigações GPL. Ao redistribuir os pesos, preservar a licença MIT. Ver `VOICE-LICENSE-MATRIX.md`.
