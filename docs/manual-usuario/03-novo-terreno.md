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

Cadastrar um terreno é registrar a **primeira oferta** dele. Por isso o sistema confere, ao clicar em **"Cadastrar terreno"** (depois de escolher os lotes), se o imóvel já existe na base. Conta como o mesmo imóvel **um lote (SQL ou inscrição) em comum** com outro terreno; sem lotes, conta a sobreposição da poligonal. Terreno escondido (ver abaixo) não entra na conta.

Se achar, abre a janela **"Este imóvel já está na base"** com só dois caminhos: **"Não cadastrar"** ou cadastrar. O que aparece depende do caso:

| Caso | O que acontece ao cadastrar |
|---|---|
| **Mesmos lotes** | Não nasce terreno novo: a oferta entra como **nova oferta do terreno existente**, em Ofertas recebidas. O terreno continua com uma só oferta ativa. |
| **Lotes diferentes, com algum em comum** (sobreposição parcial) | Nasce um terreno novo, ligado ao existente. Os dois ganham a marca **"Sobreposição parcial"** na ficha. |

A **lupa** abre **"Comparar os lotes"**: o mapa real das quadras da prefeitura duas vezes, lado a lado, um para cada cadastro, com os lotes em comum numa cor e os só daquele cadastro noutra, e a lista dos SQLs de cada um embaixo.

**Quem decide qual tratativa vale:** só uma tratativa do mesmo imóvel fica ativa de cada vez, e só o terreno dela aparece no mapa, no funil e nas listas.

- **Você é o responsável pelo terreno existente:** vê o código dele e o botão **"Abrir ficha"**. Com a tratativa vencida, escolhe se mantém a outra ou se a nova passa a ser a ativa. Sem vencer, a nova só pode seguir a outra.
- **O terreno é de outra pessoa:** o código não aparece, só "imóvel já existe na base". Com a tratativa vencida, a janela pergunta se você quer assumir; assumindo, você vira o responsável. Sem vencer, o cadastro fica **salvo e escondido** e você recebe um aviso no sino quando a outra vencer.
- **Diretor:** pode trocar a tratativa ativa à mão a qualquer momento.

**Vencida** = 90 dias sem nenhuma ação de uma pessoa no terreno (o que aparece nos Logs; o que o sistema grava sozinho não conta). Terreno perdido, descartado ou arquivado conta como vencido; comprado nunca vence.

**Por que existe:** para o mesmo imóvel não ser negociado ao mesmo tempo por duas pessoas da BKM, cada uma com um corretor.

## Lotes da prefeitura (São Paulo e São José dos Campos)

Em São Paulo, logo depois da poligonal, abre o **mapa de lotes da prefeitura** das quadras que a poligonal ocupa, no jeito do GeoSampa ("F 0053" e "N. 161" em cada lote; o SQL aparece ao parar o mouse).

- Vêm **marcados** os lotes que têm 20% ou mais dentro da poligonal.
- Clique num lote para marcar ou desmarcar. A roda do mouse dá zoom; há também Aproximar, Afastar e Enquadrar.
- Condomínio (só o lote mãe, sem as unidades), via de acesso e SQL de outro terreno **não se marcam**.

Botões:

- **"Usar N lotes"**: a poligonal passa a ser a soma dos lotes marcados e os SQLs entram no terreno **sem parte**, como etiquetas (ver [05](05-ficha-terreno.md#matrículas-e-sqls)).
- **"Agora não"** ou **"Seguir sem lotes"**: segue com a poligonal desenhada, sem SQL.

Se o GeoSampa não responder, aparece o erro com **"Tentar de novo"** e **"Seguir sem lotes"**.

**Em São José dos Campos** o mapa também abre logo depois da poligonal, com os lotes do **GeoSanja**. O GeoSanja não entrega a quadra pronta: o sistema descobre os lotes ponto a ponto, primeiro os que a poligonal ocupa e depois os vizinhos, até chegar às ruas. Por isso leva alguns segundos (a tela mostra quantos lotes já achou). Cada quadra montada fica guardada no sistema: da próxima vez que alguém abrir o mapa na mesma quadra, os lotes aparecem na hora. Depois de 90 dias a quadra é montada de novo, para pegar mudança no loteamento. Diferenças para São Paulo:

- Por baixo dos lotes aparece a **imagem de satélite do Google com os nomes das ruas** (o GeoSanja não dá o nome da rua).
- Cada lote mostra **"L 0011"** (o número do lote na inscrição). Parando o mouse, aparece a inscrição e a área **pelo desenho**. O GeoSanja não dá área cadastral, endereço nem número de porta.
- **Clicar fora dos lotes** pergunta ao GeoSanja qual é o lote daquele ponto e o acrescenta, já marcado. Serve para um lote de outra quadra.
- Inscrição de unidade (final diferente de 0000) avisa que o lote pode ser um condomínio.

## Passo 2 de 2: o nome

- **Nome de referência \*** (obrigatório): já vem preenchido como **"Bairro - Rua"** (o bairro da localização e a rua do acesso principal sem o tipo, como Rua ou Avenida, e sem número). Se o nome já existe, ganha 2, 3... (o primeiro fica sem número). Pode trocar à vontade.
- **Acesso principal**: aparece quando há duas ou mais ruas em volta da poligonal. Uma opção por rua, com os metros de frente; a mais longa vem marcada. O nome sugerido acompanha a escolha enquanto você não escreveu outro. As outras ruas entram como frentes do terreno.
- **SQLs** (ou **inscrições**, em São José dos Campos): mostra os lotes escolhidos, com **"Trocar SQLs"** (ou **"Escolher SQLs"**; em São José, **"Trocar inscrições"** ou **"Escolher inscrições"**).
- **Município \***: só aparece quando a localização falhou ("Não deu para saber pela localização").
- **Origem da oferta** (obrigatória): de onde veio a oferta. Com a origem **Corretor**, aparece o campo **Corretor** (também obrigatório): digite parte do nome, do apelido ou da imobiliária e a lista mostra os que combinam (sem precisar de acento nem do nome inteiro), ou clique na seta para ver todos em ordem alfabética; **"+ Novo corretor..."** fica no fim da lista (ver [06](06-ficha-comercial.md#novo-corretor)). Trocar a origem para outra tira o corretor.
- **Informações gerais**: texto livre, opcional, com as impressões sobre o corretor, a firmeza da proposta etc. Vai para a primeira oferta do terreno (a que aparece no card da oferta, na aba Comercial). É diferente das informações gerais da pedida de cada parte, que ficam em Condições pedidas.
- **Rascunho:** sem a origem (ou sem o corretor, quando a origem é Corretor) o cadastro não se conclui. Se você fechar a janela antes de cadastrar, a poligonal, os lotes e o que já preencheu ficam guardados neste navegador, e a próxima vez que abrir **Novo terreno** aparece **Cadastro em rascunho** com **Continuar** e **Descartar**.

Clique em **"Cadastrar terreno"**.

O município, o logradouro, o número e o bairro achados pela localização entram sozinhos, sem campo.

## Depois de cadastrar

- O terreno recebe o **código** (A001, A002...).
- Nasce com a parte **"Vendedor 1"** e com a **primeira oferta**, que aparece em Ofertas recebidas com a data e o número (A112-1). A negociação ainda não abre: o terreno fica em **Backlog** até alguém clicar em **"Iniciar negociação"** no quadro de avanço (ou registrar outra oferta na aba Comercial).
- A página vai para o **Mapa** com o terreno em foco.
- Em São Paulo, com SQLs, a **consulta completa do GeoSampa** roda em segundo plano para cada SQL (zonas, parâmetros, restrições, cartório) e depois a consulta pela poligonal. O andamento aparece na linha do terreno na lista do mapa: **"Consultando o GeoSampa: N de M"**. Pode continuar trabalhando enquanto isso.
- Em São José dos Campos, com inscrições, a **consulta do GeoSanja** roda do mesmo jeito em cada inscrição (zona, macrozona e restrições).
- O sistema cria a **pasta do terreno no Google Drive**, dentro de cada pasta de **DI › 01) Novos Negócios** (01) Documentos de Terrenos, 02) Documentos de Vendedores ... 07) Comunicações Oficiais). Ver [Pastas do terreno no Drive](#pastas-do-terreno-no-drive).

## Pastas do terreno no Drive

Cada terreno tem uma pasta com o mesmo nome em cada pasta de **DI › 01) Novos Negócios**. O nome segue a ordem em que o Drive deixa as pastas, por cidade, zona, bairro e data de cadastro:

`SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel`

| Parte | O que é |
| --- | --- |
| `SP` | a cidade: SP para São Paulo, SJC para São José dos Campos; outra cidade aparece com o nome inteiro |
| `ZL` | a zona: ZN, ZS, ZL, ZO, ZC (Centro), ZSE, ZSO, ZNE, ZNO; sem zona, **NA** |
| `VILA JACUÍ` | o bairro, em letras maiúsculas |
| `26 11` | ano e mês do cadastro (novembro de 2026) |
| `A001` | o código do terreno |
| `Av. São Miguel` | a rua do acesso principal, com o tipo abreviado (Rua, Av., Al., Tv., Pç., Estr., Rod.) |

- A pasta nasce até 15 segundos depois de **Cadastrar**: o sistema espera a zona chegar do GeoSampa ou do GeoSanja. Se ela demorar mais, a pasta nasce com **NA** e muda de nome quando a zona chegar.
- Mudou a cidade, a zona, o bairro ou a rua na ficha: as pastas **mudam de nome** sozinhas, com o que está dentro. O sistema confere também quando alguém que edita abre a ficha.
- Uma pasta nova criada em **01) Novos Negócios** ganha as pastas de todos os terrenos em alguns minutos, depois que alguém abrir uma ficha.
- O sistema nunca apaga nem move as pastas. Terreno excluído fica com as pastas como estavam.
- Quem vê o DI é decidido no próprio Drive, não no sistema. Por enquanto a ficha não mostra as pastas nem envia arquivos para elas.

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
