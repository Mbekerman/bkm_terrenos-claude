# 03. Novo terreno

**Disponível.** Botão **"Novo terreno"** no menu lateral (endereço `/terrenos/novo`), ou clique direito no mapa › **"Novo terreno aqui"**, ou dois cliques no vazio do mapa. Leitura e Básico não cadastram.

## Para que serve

Cadastrar um terreno que chegou à BKM. O cadastro é curto de propósito: **a poligonal e o nome de referência**. Partes, matrículas, SQLs, ofertas e o resto se preenchem depois, na ficha, ao longo da jornada.

**Regra:** todo terreno começa pela **poligonal** (o contorno no mapa). Não dá para cadastrar só com o endereço ou só com uma matrícula. A poligonal é de onde o sistema tira o município, o endereço, o cartório, a área e os lotes da prefeitura.

## Passo 1 de 2: a poligonal

Há três jeitos de dar a poligonal.

### A) Desenhar no mapa

1. Clique em **"Desenhar no mapa"**.
2. Ache o endereço na barra de busca do mapa e aproxime.
3. Clique em cada canto do terreno. A barra pequena no canto de baixo à direita mostra os pontos e a área, com **Cancelar** e **Concluir**.
4. Para terminar: **Concluir**, **Enter** ou **dois cliques** em qualquer lugar do mapa (o duplo clique não marca ponto a mais).

Durante o desenho:

- **Ctrl+Z** desfaz o último ponto.
- **Dois cliques num ponto já marcado** abrem o menu do ponto (**Desfazer**, **Cancelar desenho**).
- **Esc** ou dois cliques fora do mapa cancelam.
- A legenda, os três pontinhos e os botões do canto somem; só a busca de endereço fica.

### B) Importar KMZ ou KML

1. Clique em **"Importar KMZ ou KML"** ("Arquivo do Google Earth com o polígono do terreno").
2. Escolha o arquivo no computador.
3. Se o arquivo tem mais de um polígono, escolha qual é o terreno.

**Dica:** no Google Earth, desenhe o polígono, clique com o botão direito nele › "Salvar lugar como..." › KMZ.

### C) Incluir por SQL (só São Paulo)

1. Clique em **"Incluir por SQL"**.
2. Digite o SQL (11 dígitos) e clique em **Incluir**. O sistema confere o dígito no GeoSampa.
3. Repita para cada lote. Os SQLs aparecem em etiquetas com **x** para tirar.
4. Ou clique em **"Escolher no mapa"**, que abre o mapa de lotes das quadras dos SQLs digitados, para marcar os lotes vizinhos com o mouse.
5. Clique em **Continuar**. A poligonal vira a **soma dos lotes**.

**Regras:** SQL repetido ou que já está em outro terreno é recusado. Lotes que não se encostam são recusados (o terreno precisa ser uma área contínua).

## Se outro terreno já ocupa a área

Com a poligonal pronta, o sistema procura terrenos já cadastrados que ocupam parte dela. Uma faixa de até 5 m na divisa não conta (salvo se cobrir metade de um dos dois), para não acusar vizinhos.

Se houver sobreposição, aparece o terreno existente e as opções, conforme o caso:

| Caso | Opção principal |
|---|---|
| É a mesma área | **"Nova oferta neste terreno"**: registra a oferta no terreno existente, sem mudar o cadastro. |
| A área nova está dentro da existente | **"Nova oferta de parte do terreno"**: a oferta guarda o pedaço oferecido. |
| A área nova contém a existente | **"Recadastrar com a área nova"**: troca a poligonal do terreno pela nova. |
| As áreas se cruzam | **"Recadastrar juntando as áreas"** ou **"Recadastrar só com a área nova"**. |

Sempre há também **"Abrir ficha"** (do terreno existente) e **"É outro terreno, cadastrar mesmo assim"**.

**Regra:** recadastrar guarda a poligonal anterior no histórico.

**Por que existe:** para o mesmo terreno não entrar duas vezes quando chega por corretores diferentes. Duas ofertas do mesmo terreno devem ficar no mesmo cadastro.

## Lotes da prefeitura (São Paulo)

Em São Paulo, logo depois da poligonal, abre o **mapa de lotes da prefeitura** das quadras que a poligonal ocupa, no jeito do GeoSampa ("F 0053" e "N. 161" em cada lote; o SQL aparece ao parar o mouse).

- Vêm **marcados** os lotes que têm 20% ou mais dentro da poligonal.
- Clique num lote para marcar ou desmarcar. A roda do mouse dá zoom; há também Aproximar, Afastar e Enquadrar.
- Condomínio (só o lote mãe, sem as unidades), via de acesso e SQL de outro terreno **não se marcam**.

Botões:

- **"Usar N lotes"**: a poligonal passa a ser a soma dos lotes marcados e os SQLs entram no terreno **sem parte**, como etiquetas (ver [05](05-ficha-terreno.md#matrículas-e-sqls)).
- **"Agora não"** ou **"Seguir sem lotes"**: segue com a poligonal desenhada, sem SQL.

Se o GeoSampa não responder, aparece o erro com **"Tentar de novo"** e **"Seguir sem lotes"**.

## Passo 2 de 2: o nome

- **Nome de referência \*** (obrigatório): já vem preenchido como **"Bairro - Rua"** (o bairro da localização e a rua do acesso principal sem o tipo, como Rua ou Avenida, e sem número). Se o nome já existe, ganha 2, 3... (o primeiro fica sem número). Pode trocar à vontade.
- **Acesso principal**: aparece quando há duas ou mais ruas em volta da poligonal. Uma opção por rua, com os metros de frente; a mais longa vem marcada. O nome sugerido acompanha a escolha enquanto você não escreveu outro. As outras ruas entram como frentes do terreno.
- **SQLs**: em São Paulo, mostra os lotes escolhidos, com **"Trocar SQLs"** (ou **"Escolher SQLs"**).
- **Município \***: só aparece quando a localização falhou ("Não deu para saber pela localização").

Clique em **"Cadastrar terreno"**.

O município, o logradouro, o número e o bairro achados pela localização entram sozinhos, sem campo.

## Depois de cadastrar

- O terreno recebe o **código** (A001, A002...).
- Nasce com a parte **"Vendedor 1"**, sem oferta (fica em **Backlog** até a primeira oferta).
- A página vai para o **Mapa** com o terreno em foco.
- Em São Paulo, com SQLs, a **consulta completa do GeoSampa** roda em segundo plano para cada SQL (zonas, parâmetros, restrições, cartório) e depois a consulta pela poligonal. O andamento aparece na linha do terreno na lista do mapa: **"Consultando o GeoSampa: N de M"**. Pode continuar trabalhando enquanto isso.

## Próximos passos (na ficha)

1. Aba **Terreno**: partes, matrículas e SQLs, áreas. Ver [05](05-ficha-terreno.md).
2. Aba **Comercial**: registrar a oferta (abre a negociação). Ver [06](06-ficha-comercial.md).
3. Conferir **Parâmetros** e **Entorno**. Ver [07](07-ficha-parametros.md) e [08](08-ficha-entorno.md).

## O que não é possível

- Cadastrar sem poligonal.
- Cadastrar a mesma matrícula ou o mesmo SQL em dois terrenos.
- Incluir por SQL fora de São Paulo (em São José dos Campos, a inscrição imobiliária entra depois, na ficha).
- Usar bem o mapa de lotes no celular: a tela do celular ainda não foi revisada.
- A consulta do GeoSampa e do GeoSanja só funciona na versão publicada (endereço do sistema), não num computador de desenvolvimento.
