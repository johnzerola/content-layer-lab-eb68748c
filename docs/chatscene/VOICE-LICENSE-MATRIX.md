# ChatScene — Matriz de licenças de voz e áudio

| Item | Origem | Uso permitido | Observação |
| --- | --- | --- | --- |
| Vozes sintéticas do elenco | TTS do gateway (server-side) | Uso comercial conforme termos do provedor | Vozes genéricas; nenhuma associada a pessoa real |
| Nomes dos presets (Clara, Bruno, ...) | Criados neste projeto | Livre | Rótulos próprios, não marcas |
| Estilos de fala (calma, nervosa, ...) | Direções de texto próprias | Livre | Apenas instrução textual ao TTS |
| Música de fundo | Fornecida pelo usuário via endereço | Responsabilidade do usuário | UI avisa "uso permitido"; nada é embutido no produto |
| Mídia enviada (foto, vídeo, figurinha) | Usuário | Responsabilidade do usuário | Mesmo aviso já aplicado na Phase 3 |

## Regras firmes

1. Nunca clonar, imitar ou aproximar a voz de pessoa real, pública ou privada.
2. Nenhuma chave de provedor de voz sai do servidor.
3. Nenhum asset de áudio de terceiros é distribuído junto do produto.
4. Qualquer novo provider de voz entra por `VoiceProvider` e só após checagem de licença
   registrada nesta matriz.
