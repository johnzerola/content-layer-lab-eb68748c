# Providers externos

Pesquisa verificada em 2026-09-11. Nenhum provider está habilitado nesta fase.

| Provider | Uso futuro | Regras que afetam o adapter | Estado |
|---|---|---|---|
| [Pexels](https://www.pexels.com/api/documentation/) | fotos e vídeos | link proeminente, crédito ao autor quando possível, limites de API, chave server-side | preparado, sem endpoint/chave |
| [Pixabay](https://pixabay.com/api/docs/) | imagens e vídeos | cache de respostas por 24h, sem mass download, imagem sem hotlink permanente, mostrar origem | preparado, sem endpoint/chave |
| [GIPHY](https://developers.giphy.com/docs/) | GIFs e stickers | “Powered by GIPHY”, rating, renditions e limites da chave | somente documentação |
| [Mixkit](https://mixkit.co/license/) | vídeo/música/SFX/templates | licença varia por tipo e pode ser Free ou Restricted; sem scraping | bloqueado até método autorizado |
| [Freesound](https://freesound.org/docs/api/terms_of_use.html) | música/SFX | API gratuita é não comercial; conteúdo tem CC0/BY/BY-NC; uso comercial exige acordo | desabilitado comercialmente |

`EdgeLibraryProvider` só aceita endpoints internos `/api/`; nenhuma API key é lida no cliente. Um adapter real deve normalizar metadata, preservar `providerItemId` e `sourceUrl`, e copiar o asset para storage somente quando os termos permitirem.
