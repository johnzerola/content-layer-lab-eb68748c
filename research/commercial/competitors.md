# Referências comerciais públicas

| Referência | Informação pública utilizável | O que não está demonstrado |
|---|---|---|
| Adobe After Effects | Content-Aware Fill para vídeo possui fluxo documentado com região de preenchimento e referências [1] | Modelo/pesos internos e superioridade em legendas |
| Runway | Documentação pública de inpainting é uma fonte candidata de operação [2] | Arquitetura proprietária, termos específicos de benchmarking e resultado local |
| Media.io / AniEraser / HitPaw / AirBrush / CapCut | Candidatos para rodadas futuras de produto/API/termos | Nenhum motor ou score atribuído sem fonte técnica |

A principal lição operacional do fluxo Adobe é que referência editável e
delimitação da região são parte do processo de reconstrução. Isso motiva uma
ablação independente de referências no Cleaner; não identifica o modelo da Adobe.

1. Adobe, [Content-Aware Fill](https://helpx.adobe.com/after-effects/desktop/remove-objects-from-your-videos/content-aware-fill.html), documentação consultada em 10/09/2026.
2. Runway, [Inpainting](https://help.runwayml.com/hc/en-us/articles/19158047327507-Inpainting), referência a verificar em rodada específica; não usada para afirmar arquitetura.

Não foram realizados uploads, testes pagos, scraping de funcionalidades autenticadas
ou contato com empresas. A pesquisa inicial cobre Vmake e Adobe com fontes abertas;
a cobertura dos demais concorrentes está explicitamente pendente.
