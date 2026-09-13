# ChatScene — presets reutilizáveis de atuação vocal

## Resultado

Adicionar uma coleção permanente de vozes prontas em português brasileiro para reutilizar em qualquer conversa. A seleção continuará salva dentro do `ChatSceneProject`, sem criar um segundo estado para voz.

Não será criada imitação de pessoa real. A referência “Adam” será traduzida para um arquétipo genérico de narrador masculino grave e cinematográfico.

## Implementação

### 1. Biblioteca de presets prontos

- Criar presets genéricos com nomes claros em português, incluindo:
  - Narrador grave e melancólico
  - Adulto triste e contido
  - Criança sintética triste
  - Criança sintética alegre
  - Sussurro de segredo
  - Dramático cinematográfico
  - Nervoso natural
  - Sarcástico leve
- Definir em cada preset a voz-base, velocidade, pitch, energia, expressividade, calor, brilho e aspereza.
- Manter limites moderados para evitar voz infantil artificial demais ou efeito de “chipmunk”.

### 2. Escolha rápida no Voice Cast

- Adicionar uma área “Presets de atuação” em cada personagem, antes dos ajustes avançados.
- Mostrar opções compactas e selecionáveis, com o preset ativo claramente marcado.
- Ao escolher, atualizar o `VoiceProfile` do participante e invalidar somente as falas dele que precisam ser regeradas.
- Manter o seletor completo existente para quem quiser explorar todo o catálogo.

### 3. Persistência e reutilização

- Salvar a escolha no perfil vocal já existente do personagem.
- Preservar a escolha no autosave, ao reabrir o projeto, no preview e na exportação.
- Incluir o preset e seus parâmetros na chave de cache para não reaproveitar áudio com atuação antiga.

### 4. Direção natural em pt-BR

- Ajustar as instruções de atuação conforme cada preset: emoção, ritmo, pausas, projeção e timbre.
- Continuar usando o provider real atual e vozes sintéticas genéricas, sem clonagem ou imitação de pessoas.

### 5. Validação

- Cobrir aplicação, persistência e troca de preset em testes.
- Verificar TypeScript, lint, testes, build e a tela em desktop e celular.
