# Contrato de efeitos

`EffectDefinition` descreve parâmetros e renderer. `EffectInstance` guarda valores do usuário, estado enabled e ordem futura em `clip.effects[]`.

Built-ins iniciais são não destrutivos: brilho, contraste, saturação, temperatura, matiz, opacidade, blur, nitidez leve e vinheta. Os cards mostram before/after produzido pelos parâmetros da definição.

Na próxima fase, cada instance deve permitir habilitar, desabilitar, reordenar, editar e remover por comandos com undo/redo. Um efeito só entra no compositor quando preview e export possuem implementação equivalente.
