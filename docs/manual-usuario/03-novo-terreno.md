# 03. Novo terreno

**Disponível.** Botão **"Novo terreno"** no menu lateral (endereço `/terrenos/novo`), ou clique direito no mapa › **"Novo terreno aqui"** (não aparece sobre um terreno já cadastrado), ou dois cliques no vazio do mapa. Leitura e Básico não cadastram.

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

### D) Incluir por inscrição (só São José dos Campos)

O mesmo caminho do SQL, com a **inscrição imobiliária** (14 dígitos, 00.0000.0000.0000), conferida no **GeoSanja**:

1. Clique em **"Incluir por inscrição"**.
2. Digite a inscrição e clique em **Incluir**. Se o GeoSanja não acha o lote, a inscrição é recusada.
3. Ou clique em **"Escolher no mapa"**, que monta as quadras das inscrições digitadas para marcar os lotes vizinhos.
4. Clique em **Continuar**. A poligonal vira a **soma dos lotes**.

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

## Lotes da prefeitura (São Paulo e São José dos Campos)

Em São Paulo, logo depois da poligonal, abre o **mapa de lotes da prefeitura** das quadras que a poligonal ocupa, no jeito do GeoSampa ("F 0053" e "N. 161" em cada lote; o SQL aparece ao parar o mouse).

- Vêm **marcados** os lotes que têm 20% ou mais dentro da poligonal.
- Clique num lote para marcar ou desmarcar. A roda do mouse dá zoom; há também Aproximar, Afastar e Enquadrar.
- Condomínio (só o lote mãe, sem as unidades), via de acesso e SQL de outro terreno **não se marcam**.

Botões:

- **"Usar N lotes"**: a poligonal passa a ser a soma dos lotes marcados e os SQLs entram no terreno **sem parte**, como etiquetas (ver [05](05-ficha-terreno.md#matrículas-e-sqls)).
- **"Agora não"** ou **"Seguir sem lotes"**: segue com a poligonal desenhada, sem SQL.

Se o GeoSampa não responder, aparece o erro com **"Tentar de novo"** e **"Seguir sem lotes"**.

**Em São José dos Campos** o mapa também abre logo depois da poligonal, com os lotes do **GeoSanja**. O GeoSanja não entrega a quadra pronta: o sistema descobre os lotes ponto a ponto, primeiro os que a poligonal ocupa e depois os vizinhos, até chegar às ruas. Por isso leva alguns segundos (a tela mostra quantos lotes já achou). Diferenças para São Paulo:

- Por baixo dos lotes aparece a **imagem de satélite do Google com os nomes das ruas** (o GeoSanja não dá o nome da rua).
- Cada lote mostra **"L 0011"** (o número do lote na inscrição). Parando o mouse, aparece a inscrição e a área **pelo desenho**. O GeoSanja não dá área cadastral, endereço nem número de porta.
- **Clicar fora dos lotes** pergunta ao GeoSanja qual é o lote daquele ponto e o acrescenta, já marcado. Serve para um lote de outra quadra.
- Inscrição de unidade (final diferente de 0000) avisa que o lote pode ser um condomínio.

## Passo 2 de 2: o nome

- **Nome de referência \*** (obrigatório): já vem preenchido como **"Bairro - Rua"** (o bairro da localização e a rua do acesso principal sem o tipo, como Rua ou Avenida, e sem número). Se o nome já existe, ganha 2, 3... (o primeiro fica sem número). Pode trocar à vontade.
- **Acesso principal**: aparece quando há duas ou mais ruas em volta da poligonal. Uma opção por rua, com os metros de frente; a mais longa vem marcada. O nome sugerido acompanha a escolha enquanto você não escreveu outro. As outras ruas entram como frentes do terreno.
- **SQLs** (ou **inscrições**, em São José dos Campos): mostra os lotes escolhidos, com **"Trocar SQLs"** (ou **"Escolher SQLs"**; em São José, **"Trocar inscrições"** ou **"Escolher inscrições"**).
- **Município \***: só aparece quando a localização falhou ("Não deu para saber pela localização").

Clique em **"Cadastrar terreno"**.

O município, o logradouro, o número e o bairro achados pela localização entram sozinhos, sem campo.

## Depois de cadastrar

- O terreno recebe o **código** (A001, A002...).
- Nasce com a parte **"Vendedor 1"**, sem oferta (fica em **Backlog** até a primeira oferta).
- A página vai para o **Mapa** com o terreno em foco.
- Em São Paulo, com SQLs, a **consulta completa do GeoSampa** roda em segundo plano para cada SQL (zonas, parâmetros, restrições, cartório) e depois a consulta pela poligonal. O andamento aparece na linha do terreno na lista do mapa: **"Consultando o GeoSampa: N de M"**. Pode continuar trabalhando enquanto isso.
- Em São José dos Campos, com inscrições, a **consulta do GeoSanja** roda do mesmo jeito em cada inscrição (zona, macrozona e restrições).

## Próximos passos (na ficha)

1. Aba **Terreno**: partes, matrículas e SQLs, áreas. Ver [05](05-ficha-terreno.md).
2. Aba **Comercial**: registrar a oferta (abre a negociação). Ver [06](06-ficha-comercial.md).
3. Conferir **Parâmetros urbanísticos** (na aba Terreno) e **Entorno**. Ver [07](07-ficha-parametros.md) e [08](08-ficha-entorno.md).

## O que não é possível

- Cadastrar sem poligonal.
- Cadastrar a mesma matrícula ou o mesmo SQL em dois terrenos.
- Incluir por SQL ou por inscrição, ou abrir o mapa de lotes, fora de São Paulo e São José dos Campos.
- Usar bem o mapa de lotes no celular: a tela do celular ainda não foi revisada.
- A consulta do GeoSampa e do GeoSanja só funciona na versão publicada (endereço do sistema), não num computador de desenvolvimento.
