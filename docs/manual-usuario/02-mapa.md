# 02. Mapa

**Disponível.** Menu lateral › **Mapa**, endereço `/mapa`.

## Para que serve

O Mapa é a tela principal do dia a dia. Nela você vê todos os terrenos da BKM no mapa e numa lista, acha um terreno, abre a ficha dele sem sair do mapa, cria um terreno novo, ajusta a poligonal, olha a renda e a densidade da população por região, vê a concorrência (empreendimentos de outras empresas) e mede distâncias e áreas.

## O que você vê

- **À esquerda**, a **lista de terrenos**.
- **À direita**, o **mapa**, com:
  - no alto à esquerda, a **busca de endereço** (recolhida num botão redondo com a lupa);
  - no alto à direita, o botão de **três pontinhos (⋮)** e a **legenda**;
  - no canto de baixo à direita, os botões **Régua**, **Minha localização**, **Tela cheia** e o **bonequinho do Street View**.

O mapa abre no tipo **Satélite** (com nomes de ruas) e na posição e zoom em que você o deixou da última vez, mesmo depois de fechar o navegador.

## Lista de terrenos

Cada linha mostra:

- uma **bolinha com o código** do terreno (A123), na cor da subetapa em que ele está (a mesma cor que a legenda dá; terrenos em Stand By, Perdido, Descartado ou Backlog têm a cor dessas situações);
- o **nome de referência**;
- a **área** e a **etapa** do funil;
- uma **lupa**, que abre a ficha do terreno numa gaveta sobre o mapa.

No alto da lista ficam o total (**"N terrenos · m²"**, com **"N sem localização"** quando há terrenos sem ponto no mapa) e a barra de **Filtros** (ver [11](11-filtros-e-visoes.md)). A ordem padrão é a da legenda (fase, etapa, subetapa) e depois o nome; para ordenar por outros campos, use a aba **Ordenação** da gaveta de Filtros (ver [11](11-filtros-e-visoes.md#ordenação-mapa-e-pipeline)).

**Como mudar a largura da lista:** arraste a borda entre a lista e o mapa (o cursor vira ⇔). No mínimo, a lista mostra só as bolinhas. **Dois cliques** na borda voltam à largura padrão. O sistema lembra a largura no seu navegador.

### Como o terreno aparece no mapa

Cada terreno aparece como uma **etiqueta com o código** (A112), na cor da fase, da etapa ou da subetapa, com contorno branco e preto e um **ponto embaixo** que marca o lugar exato. O formato é diferente dos pinos redondos do Google, para o terreno se destacar logo de cara. A etiqueta fica um pouco maior com o mapa na escala de bairro, que é o tamanho máximo dela; afastando mais, ela diminui junto com os ícones do Google. O terreno selecionado ganha um anel azul em volta da etiqueta e o ponto fica azul.

**Terrenos muito perto um do outro.** Quando as etiquetas se encostariam na tela (mapa afastado, ou terrenos vizinhos de lote), elas viram uma **bolha com o número** de terrenos, no meio deles. O anel em volta da bolha tem uma fatia na cor de cada terreno. Aproximando o mapa, a bolha se desfaz sozinha assim que as etiquetas cabem separadas. O terreno selecionado (pela lista, por exemplo) nunca entra na bolha. Com o mouse parado sobre a bolha, abre a lista dos terrenos dali (código, nome e etapa); clique numa linha para abrir a ficha. Clicar no número aproxima o mapa até as etiquetas se separarem. Se já estiver bem de perto e elas continuarem juntas (terrenos no mesmo ponto), o clique deixa a lista aberta; clicar fora, arrastar o mapa ou apertar Esc fecha.

### Selecionar um terreno

- Clique na **linha** da lista, no **pino** ou na **poligonal**: o terreno fica selecionado (a etiqueta ganha o anel azul e a linha se destaca; a lista rola até ela).
- A linha selecionada mostra os botões **"Editar poligonal"** (ou **"Desenhar poligonal"**, se o terreno ainda não tem) e **"Street View"**.
- Clicar no vazio do mapa tira a seleção.

**Dica:** só parar o mouse sobre a linha, o pino ou a poligonal já faz o sistema carregar a ficha por trás, então ela abre na hora quando você clica.

### Abrir a ficha na gaveta

No computador, clicar no **pino**, na **poligonal** ou na **lupa** da linha abre a ficha completa do terreno numa **gaveta** que vem da direita, sobre o mapa (endereço `/mapa/A123/ficha`). Com a gaveta aberta:

- clicar noutro terreno troca o terreno da gaveta;
- **X** ou **Esc** fecham;
- **a aba com a seta**, no meio da borda esquerda, **encolhe** a gaveta para a direita sem fechar, como o painel do Google Maps: só a aba fica na tela e o mapa aparece inteiro; clicar na aba de novo, no mesmo pino ou noutro terreno abre a gaveta outra vez (a gaveta sempre abre aberta); com uma janela aberta por cima da ficha (estudo de massa, viabilidade...), a aba some até a janela fechar;
- **Tab** minimiza e maximiza a gaveta: aberta, o Tab a encolhe para a direita, deixando só a seta, como a aba da borda; encolhida, abre de novo. Com a gaveta fechada (no X ou no Esc), o Tab abre a ficha do último terreno que esteve na gaveta nesta página (guardado no seu navegador, independente do Pipeline). O Tab vale mesmo com o cursor num campo da ficha (o que foi digitado é gravado antes de encolher); para passar de um campo ao próximo, use o **Enter**. Com uma janela, um menu ou uma lista de sugestões aberta por cima, o Tab continua funcionando como antes dentro dela. Antes de abrir a gaveta pela primeira vez nesta página, o Tab não faz nada.
- **"Abrir página"** leva à ficha em tela própria;
- a largura da gaveta se arrasta pela borda esquerda (a pega aparece quando o mouse passa pela borda) (no mínimo, a largura em que a barra das abas da ficha cabe inteira); dois cliques na borda voltam ao padrão; o sistema lembra a largura;
- **a gaveta lembra onde você parou em cada terreno**: a aba, a posição da rolagem e quais quadros estavam abertos ou fechados em cada aba. Ao reabrir a gaveta daquele terreno (depois de fechar, trocar de terreno ou até fechar o navegador), tudo volta como estava. Terreno que nunca foi aberto começa na Visão geral, do topo. Fica guardado neste navegador, para os 50 terrenos abertos mais recentemente; em outro computador ou navegador, a gaveta começa do zero.

A gaveta tem tudo que a ficha tem e se edita igual; o código, o nome e a temperatura ficam no cabeçalho dela, e o ícone ao lado ("Abrir página") leva à ficha em tela própria. Ver [04](04-ficha-visao-geral.md).

## Legenda

A legenda fica no canto de cima à direita. Ela começa **fechada** e lembra no navegador se você a deixou aberta.

- **Abre sozinha** quando você para o mouse sobre ela por 0,75 s. **Fecha sozinha** 1 s depois que o mouse sai.
- O **olhinho** ao lado do título a deixa **fixa aberta**.
- A **seta** abre e fecha.
- Um clique fora dela (não um arraste do mapa) fecha, salvo se estiver fixa.

### Terrenos (em árvore)

A legenda mostra os terrenos em árvore: **Terrenos › fases › etapas › subetapas**, e depois **Backlog**, **Perdido** e **Descartado**. Cada item tem uma bolinha de cor e o número de terrenos.

- Clicar no **nome** de uma fase abre as etapas dela embaixo; clicar numa etapa abre as subetapas. Só um ramo fica aberto por vez. O nível mais fundo aberto é o que dá a cor aos pinos.
- Clicar na **bolinha** de um item **apaga** (ou acende) todos os terrenos dele: ficam cinzas na legenda e somem do mapa e da lista. A bolinha de "Terrenos" apaga ou acende todos.
- O **número** não liga nem desliga nada.
- **"Limpar busca e legenda"** acende tudo de novo.

O que você apagou fica guardado no navegador e vale na próxima vez.

**Cores pensadas para o satélite.** Backlog é **amarelo-claro**, Obras é **lavanda**, Entregue é **verde-menta** e Descartado é **cinza-claro**; nesses quatro, o ponto do pino e o código na lista ficam escuros. As outras fases, Stand By e Perdido mantêm as cores de antes. Os tons claros existem porque o cinza e o azul-marinho sumiam sobre a imagem de satélite, e o pino cinza se confundia com os lugares do Google.

### Concorrência

Embaixo dos terrenos, o item **Concorrência** liga e desliga a camada de empreendimentos de outras empresas (ver abaixo). A seta ao lado abre:

- uma linha por **faixa de R$/m²**: Abaixo de 7 mil, 7 a 8 mil, 8 a 9, 9 a 10, 10 a 11, 11 a 13, 13 a 15, 15 a 18, 18 a 25, Acima de 25 mil, e Sem preço;
- uma linha por **situação**: Breve lançamento, Lançamento, Em obras, Pronto, Usado, Sem situação.

Cada linha tem a contagem e liga e desliga só aquela.

## Busca de endereço

1. Clique na **lupa** (ou pare o mouse sobre ela por 0,75 s).
2. Digite o endereço e escolha uma sugestão do Google.
3. O mapa vai até o endereço.

A seta à direita da barra fecha e limpa a busca. Vazia, sem o cursor e sem o mouse em cima por 3 s, a barra fecha sozinha. Com a camada de renda ou densidade ligada, a busca vai ao zoom 17 e põe um pino.

**Dica:** esta busca é de **endereço no mapa**. Para achar um terreno cadastrado pelo nome ou código, use a busca da barra de cima (ver [01](01-entrar-e-navegar.md#busca-de-cima)).

## Menu dos três pontinhos (⋮)

Abre ao clicar ou ao parar o mouse sobre ele por 0,75 s; fecha 1 s depois que o mouse sai. Itens:

- **Filtro da concorrência**: abre a gaveta do filtro dos empreendimentos (ver abaixo).
- **Filtro dos terrenos**: a mesma gaveta do botão Filtros da lista. Ver [11](11-filtros-e-visoes.md).
- **Régua**: liga a régua (ver abaixo).
- **Camadas**: **Mapa de Renda** e **Mapa Demográfico**. Uma camada de cada vez.
- **Tipo de mapa**: **Mapa** ou **Satélite**. O sistema lembra a escolha.

## Camadas de renda e densidade

**Para que servem:** ver a renda familiar estimada e a densidade de moradores de cada pedaço da cidade (setor censitário do IBGE), para avaliar se a região combina com o produto MCMV.

**Como ligar:** ⋮ › Camadas › **Mapa de Renda** ou **Mapa Demográfico**. Com uma delas ligada, o mapa passa para Satélite (você pode trocar enquanto ela está ligada) e volta ao tipo escolhido quando desliga.

**O que aparece:**

- Cada setor pintado pela faixa. **Mais escuro = mais renda** (ou mais densidade).
- **Legenda das cores** no canto de cima à direita: fechada, é a escala numa linha com os limites em mil; aberta (clique), a lista de faixas.
- Clicar num setor abre o **quadro do setor**: renda (ou densidade), faixa, dados do IBGE e o código do setor. Há um link para a **Metodologia**, que explica a conta.

**Renda:** 16 faixas fixas (limites 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 15, 18, 22, 25 e 30 mil). Até 13 mil (teto da Faixa 4 do MCMV 2026), do amarelo-claro ao vinho; de 13 a 22 mil, azuis; acima de 22 mil, verdes. A renda é **estimada**: renda do responsável pelo domicílio no Censo 2022 × 1,6 (para virar renda da família) × correção pela PNAD até 2025. O valor original do IBGE também aparece.

**Densidade:** pessoas ÷ área do setor (hab/km²). É **bruta**: a área inclui ruas, praças e vazios. Faixas: Sem moradores, até 2.500, 5.000, 10.000, 15.000, 20.000, 30.000, 50.000, 100.000 e acima.

**Regras:**

- Setor em sigilo do IBGE fica **sem cor**. Nunca é zero.
- Hoje só há dados de **São Paulo** e **São José dos Campos**.
- A camada ligada fica guardada: se você sair do mapa e voltar em até **30 minutos**, ela continua ligada; depois disso, desliga.

## Concorrência (empreendimentos de outras empresas)

**Para que serve:** ver o que outras incorporadoras lançaram perto do terreno, a que preço por m² e com que velocidade de venda.

**De onde vem:** do monitor de mercado da BKM, que coleta os dados do **Órulo**. Não há cadastro manual de concorrência.

**No mapa:** cada empreendimento é um quadrado na cor da faixa de **R$/m²** (média das unidades à venda: soma dos preços ÷ soma das áreas), com um desenho da situação dentro: **estrela** no lançamento, **guindaste** em obras, **prédio** no pronto.

As cores são suaves (tons pastel, do lilás nos preços mais baixos ao rosa nos mais altos, passando por azul, verde, creme e salmão), para os terrenos da BKM continuarem sendo o que mais chama a atenção.

**Bolhas (de longe):** até o zoom 13 (de mais ou menos a cidade inteira até uns 20 km de largura na tela), empreendimentos próximos que têm **a mesma situação e a mesma faixa de R$/m²** viram uma bolha redonda, na cor da faixa e com o desenho da situação. O tamanho da bolha cresce com a soma das unidades. Parando o mouse sobre ela aparece, por exemplo, "Lançamento · R$/m² 11 a 13 mil · 8 empreendimentos · 1.640 unidades". O clique na bolha aproxima o mapa até mostrar os empreendimentos dela separados. Do zoom 14 para perto, cada empreendimento aparece sozinho, com o seu quadrado. Quem está sozinho na região continua como quadrado em qualquer zoom.

**Card do empreendimento** (clique no quadrado):

- R$/m² médio das unidades à venda, com o **Enquadramento social** (Sim, Não ou Não informado) logo abaixo;
- lançamento, entrega, unidades, estoque, vendas e **VSO**;
- **VSO mensal médio** desde o lançamento, pelo histórico de vendas do Órulo (dez/2023 em diante), com um selo colorido dizendo em que **quartil de vendas** o empreendimento está: **1º** (até 25% vendido), **2º** (25 a 50%), **3º** (50 a 75%) ou **4º** (75 a 100%), num azul que escurece quanto mais vendido. Embaixo, quanto já foi vendido e em quantos meses. O clique nessa linha abre a janela **VSO mensal médio por quartil de vendas**: o VSO desde o lançamento, dos últimos 3 e 12 meses, o gráfico com uma barra por quartil (parando o mouse na barra, o detalhe) e a tabela com o VSO e os meses de cada quartil;
- o **resumo do empreendimento**: as unidades agrupadas em tipologias parecidas (mesmos dormitórios, vagas e programa social), cada uma com Total, Estoque, R$/m² e VSO;
- **"Ver tabela completa"**: uma janela com a incorporadora, CNPJ, endereço, torres, link do Órulo e **todas as unidades** (torre, andar, número, dormitórios, vagas, área, situação, preço, R$/m², primeiro preço), com os filtros **Todas**, **À venda** e **Vendidas**.

O card fecha sozinho 1 s depois que o mouse sai dele, quando o mapa se move, no X, no Esc ou num clique fora. O **olhinho** ao lado do X o deixa fixo. O empreendimento aberto fica destacado (quadrado maior, preto, com anel azul) depois que o card fecha; qualquer clique fora dele, no mapa ou em outra parte da tela, tira o destaque e o quadrado volta à cor dele. Com o card fixado no olhinho, o destaque fica enquanto o card estiver aberto.

### Filtro da concorrência

⋮ › **Filtro da concorrência** abre uma gaveta com: dormitórios, área, preço e R$/m² (mínimo e máximo, valendo para as unidades à venda: basta uma unidade dentro de todos os limites), data de lançamento e de entrega (com "Incluir sem informação"), programa social e incorporadora. O filtro fica guardado por 30 minutos fora do mapa, como as camadas.

**O que não dá:** saber quais unidades são HIS ou HMP (o Órulo só marca o empreendimento todo como programa social). O VSO mede só o período que o monitor já coletou.

**Como ler o VSO mensal médio.** É a taxa que, vendendo todo mês a mesma fração do que sobrou, chega ao mesmo vendido no mesmo tempo. Exemplo: 94% vendido em 14 meses dá 18% ao mês. No quartil, a conta é a mesma, só com o que sobrava ao entrar nele e os meses que o empreendimento levou para atravessá-lo. Os primeiros 25% costumam sair já no mês do lançamento, com a pré-venda, por isso o 1º quartil quase sempre tem o VSO mais alto. Quando o histórico do Órulo começa depois do lançamento, os quartis vencidos antes dele ficam sem VSO (traço), e quando, num período, há mais distratos que vendas (troca da tabela ou devoluções), o período aparece como "mais distratos que vendas". Empreendimento sem histórico no Órulo não mostra a linha.

## Régua

**Para que serve:** medir distâncias e áreas no mapa.

**Como usar:**

1. Clique no botão **Régua** no canto de baixo à direita (ou ⋮ › Régua). O botão fica azul e o cursor vira seta.
2. Cada clique no mapa marca um ponto. A linha mostra a distância de cada trecho e o total. A régua mede em linha reta; não segue a rua.
3. Para medir uma **área**, marque 3 pontos ou mais e clique no **primeiro ponto**: a forma fecha e mostra a área (m², ou km² acima de 1 km²). O clique seguinte começa outra medida.

A barra pequena no canto de baixo mostra a medida com **Desfazer**, **Limpar** e **Sair**.

**Teclas:** **Backspace** apaga o último ponto; **Del** ou **Esc** apagam o desenho (sem desenho, desligam a régua); **Ctrl+Z** desfaz. Clique direito num ponto abre **"Excluir ponto"**.

Enquanto a régua está ligada, a legenda, os três pontinhos e o bonequinho somem, e os pinos não pegam o clique.

## Botões do canto

- **Minha localização**: mostra seu ponto azul com o círculo de precisão e centra o mapa nele (o navegador pede permissão na primeira vez).
- **Tela cheia**: o mapa cobre a página. **Esc** ou o mesmo botão saem.
- **Bonequinho do Street View**: arraste para uma rua para ver a foto da rua. O Street View fecha no **X** do canto de cima à direita ou no **Esc**.

## Lugares do Google

Comércios, escolas e hospitais do próprio Google ficam sempre visíveis no mapa. Clicar num deles abre o nome, a nota e até 3 avaliações, com **"Ver todas no Google Maps"**. O quadro fecha no X, num clique no mapa, no Esc ou sozinho 1 s depois que o mouse sai.

## Criar um terreno pelo mapa

- **Clique direito** em qualquer ponto do mapa › **"Novo terreno aqui"**: começa o desenho da poligonal com o primeiro ponto ali.
- **Dois cliques** no vazio do mapa fazem o mesmo.
- Sobre o pino ou dentro da poligonal de um terreno já cadastrado, o clique direito **não** mostra "Novo terreno aqui": o menu traz o código e o nome do terreno e só "Traçar rota a partir daqui".

O passo a passo do cadastro está em [03. Novo terreno](03-novo-terreno.md). Leitura e Básico não têm "Novo terreno aqui" (só a rota).

## Traçar rota a partir de um ponto

**Para que serve:** saber quanto tempo se leva do terreno (ou de qualquer ponto do mapa) até um endereço ou lugar, ou no sentido contrário, de carro, moto, a pé, de bicicleta ou de transporte público.

1. **Clique direito** no ponto do mapa (ou no pino ou na poligonal de um terreno) › **"Traçar rota a partir daqui"**. Abre o quadro **"Rota a partir de …"** no canto de cima à esquerda do mapa, e o ponto aparece como uma bolinha preta e branca (a saída). No terreno, a saída é o pino do terreno.
2. Escolha para onde vai a rota, de um destes jeitos:
   - no campo **"Indo para"**, digite um endereço ou o nome de um lugar (loja, estação, prédio) e escolha na lista;
   - escolha **"Minha localização"** (o navegador pede permissão);
   - **clique no mapa**: num ponto qualquer (vale o endereço dali), num lugar do Google (loja, escola, estação), no pino ou na poligonal de outro terreno, ou num quadrado da concorrência. Ao abrir o quadro, o clique no mapa já escolhe a chegada (o cursor vira o dedo indicador); depois de escolhida, o mapa volta ao normal, e para escolher de novo no mapa clique na **mira** ao lado do campo. Enquanto a mira está ligada, o clique não abre a ficha, o card da concorrência nem o quadro do lugar.
3. A rota aparece no mapa (a pé, pontilhada), com o tempo e a distância, e a chegada é um pino quadriculado preto e branco. O mapa se ajusta para mostrar a rota inteira, e os quadrados da concorrência ficam apagados enquanto a rota está aberta.
4. **Arraste os pontos** para ajustar a rota: passe o mouse sobre a bolinha da saída ou sobre o pino quadriculado da chegada (o cursor vira o dedo e o ponto cresce um pouco), segure e solte em outro lugar. A rota é recalculada a partir do endereço de onde o ponto foi solto, sem mudar o enquadramento do mapa. Se o lugar que você quer está fora da tela, **segure a roda do mouse** enquanto arrasta (ver abaixo).
5. O botão **⇅**, ao lado do X, **inverte o sentido**: a rota passa a ir do ponto escolhido até o ponto do clique direito ("Rota até …"), e o campo vira "Saindo de". Clique de novo para voltar.
6. Troque a forma de condução nos botões **Carro, Moto, A pé, Bicicleta e Transporte**: a rota se refaz na hora. O sistema lembra a última escolha.
7. **"Abrir no Google Maps"** abre a mesma rota no Google Maps, com o trânsito e as alternativas de lá.
8. Feche no **X** ou com **Esc**; a rota sai do mapa.

Bom saber:
- Carro e moto **não contam o trânsito** do momento (o quadro avisa). Para o trânsito, use "Abrir no Google Maps".
- A rota de **moto** é do Google, que ainda a trata como teste: confira o trajeto.
- **Transporte público** mostra as linhas usadas (ônibus, metrô, trem), saindo agora. Só funciona onde a cidade publica os horários no Google (São Paulo, sim); fora disso aparece "O Google não tem rota de transporte público entre esses dois pontos".
- Por ora só no computador (no celular, o toque longo no mapa ainda não abre o menu).

## Editar a poligonal de um terreno

**Para que serve:** corrigir o contorno do terreno.

**Como começar:**

- **Dois cliques** em qualquer ponto dentro da poligonal (não precisa ser sobre a linha; sobre o pino, não: ele abre a ficha); ou
- selecione o terreno na lista e clique em **"Editar poligonal"**.

**Editando:**

- Todos os pontos aparecem e se arrastam direto.
- **Clique direito** ou **dois cliques** num ponto abrem o menu do ponto: **"Adicionar ponto depois"**, **"Excluir ponto"** (mínimo de 3 pontos), **"Desfazer"** e **"Cancelar"**.
- O **pino** também se arrasta. Se você não o arrastar, ele fica onde estava se continuar dentro da poligonal; senão vai para o centro.
- **Arrastar o mapa no meio do arraste:** com o botão esquerdo segurando um ponto ou pino, **aperte e segure a roda do mouse** (o botão do meio): o mouse passa a arrastar o mapa, e o ponto fica parado no lugar dele. Soltando a roda, o mouse volta a levar o ponto. Vale para todo ponto que se arrasta no mapa: pontos e pino da poligonal (na página Mapa e no mini-mapa da ficha) e a saída e a chegada da rota.
- **Ctrl+Z** e **Ctrl+Y** desfazem e refazem cada movimento de ponto.
- A barra pequena no canto de baixo à direita mostra os pontos, a área, **Cancelar** e **Concluir**. A legenda, os botões do canto e os três pontinhos somem enquanto você edita.

**Para terminar:**

- **Concluir**, **Enter** ou um **clique no mapa fora da poligonal** salvam.
- **Cancelar**, **Esc** ou um clique **fora do mapa** cancelam.

Depois de salvo, o ajuste entra no Ctrl+Z da ficha e no histórico (Logs) como "Ajuste na poligonal", com a área de antes e a de depois. Ajustes feitos a menos de 2 minutos um do outro viram um registro só.

Se a rua do terreno não encosta mais na poligonal nova, o sistema pergunta **"Trocar o endereço?"**. Ver [05](05-ficha-terreno.md#endereço-e-localização).

### Selecionar lotes (São Paulo)

Em São Paulo, a barra da edição tem também **"Selecionar lotes"**. Ele abre o mapa de lotes da prefeitura das quadras da poligonal, com os SQLs do terreno já marcados. Marque e desmarque e confirme:

- a poligonal vira a **soma dos lotes marcados** e a edição termina salva;
- os SQLs que continuam marcados ficam como estavam (parte, IPTU, zonas);
- os desmarcados **saem** do terreno e das partes;
- os novos entram **sem parte** e já são consultados no GeoSampa.

Lotes que não se encostam são recusados. O **Ctrl+Z** volta tudo como estava, inclusive os SQLs tirados, com a parte, o IPTU e as zonas.

**O que não dá ainda:** editar a poligonal pelo toque longo no celular.

## O que não é possível no Mapa

- Cadastrar concorrência à mão (desligado por decisão; só Órulo).
- Marcar pontos de interesse da empresa no mapa (eles ficam só na ficha, aba Entorno).
- Ver imagens de satélite antigas (régua de tempo): a API do Google Maps para sites não oferece.
- Importar KMZ/KML pelo mapa: isso fica no [Novo terreno](03-novo-terreno.md).
