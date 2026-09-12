# Máscara de avaliação, inferência e composição

Uma única imagem chamada “mask” pode representar três coisas diferentes:
a região semanticamente anotada, a região expandida entregue ao engine e o alpha
usado na composição final. Compare cada uma na resolução correspondente.

No código consultado do DiffuEraser, a máscara passa por erosão/dilation e a
composição blended utiliza suavização. Logo, o conjunto de pixels alterados pode
ultrapassar a máscara binária original. Isso é comportamento do código, não prova
de que todo halo observado no Cleaner venha desse estágio.
[Fonte de implementação](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/diffueraser/diffueraser.py).

Experimento: conservar os três artefatos; avaliar cobertura de texto contra
anotação e alteração externa tanto contra a área autorizada quanto contra alpha
efetivo. Se só medir fora de uma máscara já expandida, é possível esconder perda
de fundo. A solução não é necessariamente aumentar a máscara.
