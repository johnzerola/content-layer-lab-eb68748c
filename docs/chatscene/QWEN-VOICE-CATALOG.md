# Catálogo sintético PT-BR do ChatScene

O catálogo contém 15 identidades sintéticas em português brasileiro, geradas
uma vez com o Qwen3-TTS VoiceDesign e usadas em produção como referências
privadas para o Chatterbox Multilingual. Elas não representam locutores reais
e não devem ser tratadas como clonagem de voz.

## Identidades

- Crianças: Bia e Lucas
- Adolescentes: Júlia, Carol e Gabriel
- Adultos conversacionais: Ana, Camila, Rafael e Marcos
- Narração: Helena e Augusto
- Pessoas idosas: Maria e Antônio
- Notícias: Clara
- Terror/suspense: Dante

## Runtime

Os WAVs gerados e o `catalog.json` ficam no diretório de dados da VPS,
separados do código-fonte. O serviço só anuncia o catálogo quando
`CHATSCENE_QWEN_CATALOG_LICENSE_APPROVED=1` e quando cada WAV está presente e
validado pelo manifesto. Se o relay CUDA não estiver disponível, a síntese cai
para o worker Chatterbox em CPU; o primeiro uso aquece o modelo e os seguintes
reutilizam o processo.

Para regenerar os assets em uma máquina com GPU:

```powershell
# Garanta que o executável `sox` esteja no PATH desta máquina.
& G:\VaiViral\qwen-voice-catalog\.venv\Scripts\python.exe `
  backend/chatscene_voice/generate_qwen_catalog.py `
  --output G:\VaiViral\qwen-voice-catalog\catalog `
  --device cuda
```

O manifesto registra a revisão exata dos pesos e a licença Apache-2.0. Uma
nova voz só deve ser publicada depois de atualizar
`docs/chatscene/VOICE-LICENSE-MATRIX.md`.
