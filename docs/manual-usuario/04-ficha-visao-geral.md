# 04. Ficha do terreno: topo, abas e Visão geral

**Disponível.** A ficha abre de três jeitos:

- na **gaveta** da página Mapa (clique no pino, na poligonal ou na lupa da linha; endereço `/mapa/A123/ficha`);
- em **página própria** (botão "Abrir página" na gaveta, ou endereço `/terrenos/A123`);
- pelo **Funil**, clicando no card do terreno.

## Para que serve

A ficha reúne tudo sobre um terreno: onde fica, de quem é, quanto pedem, o que a lei deixa construir, o que tem em volta, em que etapa está a negociação e o histórico de tudo que mudou.

## Como a ficha é organizada

De cima para baixo:

1. **Linha do tempo** das etapas (ou das fases, depois da compra), com a data de entrada em cada uma. Quando a ficha fica estreita (na gaveta do mapa, por exemplo), a linha encolhe em vez de cortar os nomes: primeiro as fases concluídas ficam só com o ✓, depois as futuras ficam só com o número (menos a próxima) e, no limite, só a fase atual mantém o nome. Pare o mouse num ✓ ou num número para ver o nome.
2. **Topo**: código, nome, **fase · etapa · subetapa**, "Cadastrado em", **temperatura**, **responsável** e **"Ficha N% completa"**.
3. **Barra das abas**, que fica presa no alto ao rolar.
4. O conteúdo da **aba** escolhida.
5. À direita, o **painel** com o quadro de avanço e Ações, Tarefas e Logs (ver [09](09-avanco-e-logs.md)).

Com mais de uma fase aberta, o topo mostra a mais adiante.

## Temperatura

A temperatura diz o quanto o terreno está promissor para a BKM. São 5 barras: **Muito fria, Fria, Morna, Quente, Muito quente**. Clique na barra para escolher; clicar de novo na mesma barra apaga (volta a "Temperatura não avaliada").

**Regra:** a temperatura é do **terreno**, uma só, e aparece sempre, também no Backlog (terreno ainda sem oferta). Ela continua quando a negociação abre, muda de etapa ou termina. Quem tem só consulta vê, mas não muda. A mudança vai para os Logs, e cliques seguidos viram um log só; a lixeira não desfaz a temperatura (é só clicar de novo).

## "Ficha N% completa"

Mostra quanto dos 12 itens que importam para decidir a compra está preenchido. A bolinha vermelha diz quantos faltam. Clique para ver a lista; escolha um item e o sistema **abre a aba, abre o campo em edição e rola até ele**, que acende em verde-limão por um instante.

Quem edita pode **descartar** um item que não se aplica àquele terreno: o **x** ao lado do item tira ele da lista e da conta do percentual, só neste terreno. O descarte fica no **Log** ("Descartado do Falta preencher: Testada"), e o fim do menu mostra **"Descartados (N)"** com **"Voltar a pedir"**. Ctrl+Z também desfaz.

Os 12 itens:

| Item | Onde se preenche |
|---|---|
| Endereço completo (logradouro, número, bairro) | Terreno › Endereço e localização |
| Zona | Terreno › Endereço e localização |
| Ponto no mapa | Poligonal no mapa |
| Área adotada | Terreno › Áreas e dimensões |
| Testada | Terreno › Áreas e dimensões |
| Matrícula | Terreno › Matrículas e SQLs |
| Inscrição e IPTU | Terreno › Matrículas e SQLs |
| Proprietário (cada parte com proprietários somando 100%) | Terreno › Partes (lápis da parte) |
| Zoneamento | Terreno › Parâmetros urbanísticos › Registrar zonas (ou automático pelo GeoSampa) |
| Valor pedido | Comercial › Condições pedidas, no valor da primeira parte (ou registrar oferta) |
| Temperatura | Topo da ficha |
| Visita técnica | Infraestrutura › Visita técnica (os 8 itens verificados) |

Quando você rola e o topo sai da vista, a barra das abas mostra um **botão de alerta** com a bolinha vermelha, que abre a mesma lista.

**Visita técnica** conta como preenchida quando os 8 itens da visita (energia, água, esgoto, drenagem, gás, asfalto, iluminação e calçada) saem de "Não verificado". Clicar nela abre Estudos Técnicos › Avaliação de infraestrutura no primeiro item que falta. Se o terreno não precisa da visita, use o x do item para descartá-lo.

## Barra das abas

As abas, nesta ordem: **Visão geral, Terreno, Comercial, Estudos de massa, Viabilidades, Infraestrutura, Entorno, Jornada, Documentos**.

| Aba | Situação | Seção do manual |
|---|---|---|
| Visão geral | Disponível | esta |
| Terreno | Disponível | [05](05-ficha-terreno.md) |
| Comercial | Disponível | [06](06-ficha-comercial.md) |
| Parâmetros urbanísticos | Disponível, como seção da aba Terreno | [07](07-ficha-parametros.md) |
| Estudos Técnicos › Estudos de massa | Disponível | [14](14-ficha-estudos-de-massa.md) |
| Estudos Técnicos › Estudos de viabilidade | Disponível em parte: lista, Resumo da viabilidade e a seção Tipologias do estudo | [15](15-ficha-viabilidades.md) |
| Estudos Técnicos › Entorno | Disponível | [08](08-ficha-entorno.md) |
| Estudos Técnicos › Avaliação de infraestrutura | **Relevo** (com o **Topográfico**), **Visita técnica** e **Viabilidades técnicas** (veja abaixo) | esta |
| Jornada, Documentos | **Ainda não disponível** (mostram "Esta aba entra depois da primeira versão") | [12](12-ainda-nao-disponivel.md) |

**Estudos Técnicos** junta quatro partes, nesta ordem: Estudos de massa, Estudos de viabilidade, Entorno e Avaliação de infraestrutura. Com ela aberta, aparecem logo abaixo da barra quatro botões, um para cada parte; o que está aberto fica em azul-claro. Clicar em Estudos Técnicos abre a parte que você viu por último na sessão (da primeira vez, Estudos de massa).

**Como andar pelas abas:**

- Clique na aba.
- A barra é uma faixa contínua, como uma roleta: as abas das pontas aparecem cortadas pela borda. Para rolar a faixa sem trocar de aba: **Shift + roda do mouse**, deslize de lado no trackpad, ou **arraste com o mouse** (com o mouse em cima, o cursor é o dedinho, como em qualquer botão; vira mão fechada enquanto você segura o botão do mouse). Solta com força, ela continua rodando e freia aos poucos.
- O **⋮ "Mais ações"** (só quando a barra não cabe) lista todas as abas, com as quatro partes de Estudos Técnicos embaixo do nome dela e a atual marcada.

Cada aba tem seu endereço (`/terrenos/A123/comercial`; nas partes de Estudos Técnicos, o da parte, como `/terrenos/A123/entorno`), então dá para mandar o link direto para uma aba.

## Quadros que abrem e fecham

Em todas as abas menos a Visão geral, o conteúdo fica em **quadros** que abrem e fecham pela **seta do título**. O primeiro quadro da aba nasce aberto; os outros, fechados. O sistema lembra o que você abriu durante a sessão, por aba. Editar um campo, abrir um formulário ou chegar a um item pelo log ou pelo aviso abre o quadro dele.

O título do quadro aberto fica preso logo abaixo das abas enquanto você rola o conteúdo dele.

## Editar no lugar

Quem pode editar (analista, gestor, diretor) vê cada valor como um campo com cara de texto. Não há botão Editar nem Salvar.

1. Clique no valor. O conteúdo fica todo selecionado; digite para substituir (o segundo clique põe o cursor).
2. Saia do campo (Tab, Enter, ou clique fora) ou escolha na lista: **grava na hora**.
3. **Esc** volta o valor que estava antes.

As gravações vão em fila, na ordem em que você fez. Se outra pessoa (ou o sistema, como a consulta do GeoSampa) mudou **o mesmo campo** depois que você abriu a ficha, o sistema recusa a sua gravação para não apagar o que ela fez, e o campo volta ao valor gravado; recarregue a página e repita. Mudança em outro campo não atrapalha.

Leitura e Básico veem os valores como texto, sem campos.

## Visão geral

Duas metades: **à esquerda o mapa, à direita o Resumo**. Em tela estreita, o mapa vem primeiro.

### Mini-mapa (Localização)

- Mostra a poligonal em azul e o pino.
- A **roda do mouse rola a página**; **Shift + roda** dá zoom.
- **Dois cliques em qualquer ponto dentro da poligonal** (não só sobre a linha) começam a edição ali mesmo: arraste os pontos; clique direito ou dois cliques num ponto abrem o menu do ponto; **clique no mini-mapa fora da poligonal, dois cliques ou Enter salvam**; clique fora do mini-mapa ou **Esc** cancelam; Ctrl+Z desfaz.
- **Dois cliques no resto do mapa** abrem a página Mapa centrada no ponto, com o terreno selecionado.
- Sem poligonal, aparece "Sem localização."

Leitura não edita a poligonal.

### Resumo

Cada linha tem uma **seta** que leva à aba onde o dado mora.

| Linha | O que mostra | Como mudar |
|---|---|---|
| **Endereço** | Logradouro, número, bairro | Lápis **"Editar no mapa"**: abre a página Mapa com a poligonal em edição (ver [05](05-ficha-terreno.md#endereço-e-localização)). |
| **Município e região** | Município · UF · Zona | O seletor de **Zona** (Norte, Sul, Leste, Oeste, Centro...) se edita ali mesmo. Em São Paulo a zona vem sozinha do GeoSampa (região oficial da subprefeitura); trocada à mão, fica a sua. |
| **Zoneamento** | As zonas, separadas por barra ("ZC / ZM / ZEU") | Terreno › Parâmetros urbanísticos (a seta abre a seção em Índices urbanísticos). |
| **Área adotada** | Área e a fonte | O seletor de **fonte** troca a área adotada ali mesmo (a Cadastral aparece sempre; as outras, quando preenchidas). |
| **Unidades do estudo válido** e **VGV do estudo válido** | Do estudo de viabilidade válido (unidades somadas das tipologias e VGV bruto) | Estudos Técnicos › Estudos de viabilidade (a seta leva lá); vazias enquanto nenhum estudo for o válido. Ver [15](15-ficha-viabilidades.md). |
| **Distância do metrô ou trem** | Estação mais próxima, minutos a pé | Automático (aba Entorno). |
| **Valor pedido na entrada** | Valor da **primeira** oferta, com a data | Aba Comercial. |
| **Perfil topográfico** | Plano, Inclinado, Acidentado... e o desnível | Medido sozinho (veja Relevo, abaixo); enquanto mede, "medindo...". A seta leva a Estudos Técnicos › Avaliação de infraestrutura. |
| **Corretor** | Corretor principal e imobiliária | Aba Comercial. |

Linhas sem dado mostram "Não informado" ou "Falta preencher".

## Gaveta da ficha no Mapa

Igual à página, com:

- o **cabeçalho** com o código, o nome, a **temperatura** e o ícone **Abrir página** (o nome aparece ao parar o mouse), que leva à ficha em tela própria;
- o topo da ficha sem repetir o cabeçalho: no lugar da linha "fase · etapa · subetapa", o nome da fase fica em cima da linha do tempo, que já marca a etapa e a subetapa; ficam "Cadastrado em" (e a situação, quando é Stand By, Perdido ou Descartado), o responsável e "Ficha N% completa". No celular, onde a linha do tempo some, a fase · etapa · subetapa continua no topo;

- **X** ou **Esc** para fechar;
- a borda esquerda arrastável (mínimo 640 px; dois cliques voltam ao padrão);
- clicar noutro terreno no mapa troca o terreno da gaveta.

A gaveta da ficha e a gaveta de filtros não abrem juntas.

## Imóvel sobreposto e terreno escondido

Quando o mesmo imóvel foi cadastrado mais de uma vez com lotes diferentes (ver [03](03-novo-terreno.md#se-outro-terreno-já-ocupa-a-área)), o alto da ficha mostra:

- **"Sobreposição parcial com A112"**: o código abre a ficha do outro, e a **lupa** abre "Comparar os lotes", com o mapa das quadras da prefeitura dos dois cadastros lado a lado.
- No terreno **escondido** (a tratativa ativa é a do outro), a faixa **"Terreno escondido"** diz se a outra tratativa está em andamento ou vencida. Enquanto isso, ele não aparece no mapa, no funil nem nas listas, mas a ficha abre pelo link ou pelo aviso. Quando pode (o responsável, com a outra vencida, ou o diretor), aparece **"Assumir a tratativa"**.

## Excluir ou deletar o terreno

Só para **diretor** e **administrador**: no topo da ficha, à direita do responsável (na gaveta do Mapa, ao lado do ícone **Abrir página**), fica o botão **⋮ Mais ações**. Para os outros papéis o botão não aparece.

- **Excluir terreno** (diretor e administrador): pede confirmação e tira o terreno de todos os lugares para todos: lista, mapa, funil (inclusive o Backlog), busca, tarefas e avisos do sino. Nada é apagado: o terreno fica guardado por **180 dias** e o administrador pode **restaurar** nesse prazo, voltando com tudo (negociação, propostas, tarefas). Passados os 180 dias, o sistema apaga de vez sozinho.
- **Deletar de vez** (só administrador): apaga **na hora** o terreno e tudo o que é dele (partes, matrículas e SQLs, negociação, ofertas, propostas, reuniões, estudos, documentos, tarefas e o histórico). Não passa pela lista de excluídos e **não tem volta**. A janela mostra o aviso e só libera o botão depois que você digita o nome do terreno (maiúsculas e espaços a mais não importam). Quando os documentos forem para o Google Drive, as pastas do terreno também serão apagadas.

Enquanto o terreno está excluído, a matrícula e os SQLs dele continuam presos a ele: tentar incluí-los em outro terreno mostra "está num terreno excluído". Para usar o número noutro terreno, o administrador restaura ou deleta o excluído.

## Visita técnica (aba Infraestrutura)

**Para que serve:** registrar o que se viu no terreno: se há energia, água, esgoto, drenagem, gás canalizado, asfalto, iluminação pública e calçada.

1. Abra **Estudos Técnicos** › **Avaliação de infraestrutura** e o quadro **Visita técnica**. O título mostra quantos itens ainda estão "não verificados".
2. Preencha a **Data da visita**. Se você marcar um item antes da data, a data da visita fica sendo a de hoje (você pode trocar).
3. Em cada item, escolha **Sim**, **Parcial**, **Não** ou **Não se aplica**. Grava na hora.
4. Ao lado, escreva uma **observação** se precisar (por exemplo: "calçada só na frente da rua principal"). Grava quando você sai do campo.

Cada mudança aparece nos Logs. Quem tem papel de Leitura só vê.

## Viabilidades técnicas (aba Infraestrutura)

**Para que serve:** acompanhar o pedido de viabilidade a cada concessionária (Energia, Água, Esgoto e Gás) e saber quando ela vence.

1. No quadro **Viabilidades técnicas**, troque a situação do serviço: **Não solicitada**, **Solicitada**, **Viável**, **Condicionada** ou **Não viável**.
2. Ao sair de "Não solicitada", aparecem a **Concessionária** e a data em que foi **Pedida**. Marcando "Solicitada", a data do pedido já vem como hoje.
3. Com a resposta da concessionária (Viável, Condicionada ou Não viável), aparecem **Emitida em** (já vem como hoje) e **Validade**. Na Condicionada, escreva as **Condições**; nas outras, uma **Observação**.

**Avisos:** com a validade já passada, o serviço mostra "Vencida em …" em vermelho e o título do quadro conta quantas venceram; nos 30 dias antes, "Vence em …" em amarelo. A validade não pode ser antes da emissão.

## Relevo (aba Infraestrutura)

**Para que serve:** saber logo, sem levantamento, se o terreno é plano, inclinado ou acidentado.

**Como funciona:** ao abrir a ficha de um terreno com poligonal e sem medição, o sistema mede sozinho as cotas dentro da poligonal (em qualquer aba; só para quem edita). Em São Paulo, pelo laser de 2020 da prefeitura; fora, pelo Google. Ao ajustar a poligonal, a medição antiga sai e o sistema mede de novo na próxima vez que a ficha abre.

O quadro **Relevo** mostra:

- A faixa com o **perfil**, na cor dele: Plano, Inclinado (com o %), Acidentado leve, mediano, intenso, agudo ou crítico, e a data da medição.
- **Declividade média** (a média da inclinação em cada ponto do terreno; é ela que decide o perfil), **Inclinação do plano** (o plano que melhor se ajusta às cotas), **Terra mexida até o plano** (corte + aterro ÷ área, só com o laser), **Desnível** e de onde vieram as **Cotas**.
- A escala dos 7 perfis, com o do terreno marcado, e a regra: Plano até 5%, Inclinado até 10%, Leve até 13%, Mediano até 19%, Intenso até 24%, Agudo até 30%; acima disso, ou com terra mexida acima de 1,5 m³/m², Crítico (os limites são os da empresa).
- **Medir de novo**, para quem edita.

**Fora de São Paulo** (cotas do Google, que erram de 1 a 4 m), o perfil fica só em Plano, Inclinado ou Crítico, com o aviso "Acidentado não avaliado". É uma triagem: não substitui o levantamento planialtimétrico.

**Se der errado:** o quadro diz "Não deu para medir o relevo" com o motivo e **Tentar de novo**. Em São Paulo o sistema nunca usa o Google no lugar do laser.

## Topográfico preliminar (aba Infraestrutura)

**Para que serve:** ter uma planta com as curvas de nível do terreno e da vizinhança para o estudo, antes do levantamento de campo.

**Onde:** **Estudos Técnicos** › **Avaliação de infraestrutura**, quadro **Relevo**, botão **Topográfico** (aparece quando o terreno tem poligonal).

1. Clique em **Topográfico**. A janela explica de onde vem cada coisa.
2. Clique em **Gerar topográfico**. A janela mostra cada passo enquanto trabalha (contorno, cotas, curvas, imagem, PDF e DXF).
3. No fim aparece a prévia da folha. Baixe o **PDF** (folha A3 para imprimir; em São Paulo sem SQL pode sair maior, veja abaixo) ou o **DXF + imagem (.zip)** (para o AutoCAD, com o mesmo PDF dentro).

**De onde vem:**

- **Contorno**: a soma dos lotes da prefeitura quando todos os SQLs (São Paulo, GeoSampa) ou todas as inscrições (São José dos Campos, GeoSanja) têm o lote; senão, a poligonal desenhada.
- **Cotas em São Paulo**: sempre do laser de 2020 da prefeitura (erro típico de 0,1 a 0,2 m na forma do terreno). Se a prefeitura não responder, aparece o erro com **Tentar de novo**: em São Paulo o Google nunca é usado.
- **Cotas fora de São Paulo**: do Google, um ponto a cada 5 m. O erro típico é de 3 a 4 m: serve para estudo, não para projeto.
- Curvas de 1 em 1 m e mestra de 5 em 5 m.
- **Imagem por trás**: o satélite do Google com os nomes das ruas, para você reconhecer as ruas e a vizinhança. Se o Google não responder, a ortofoto da prefeitura.
- O levantamento cobre o terreno e 30 m em volta.
- **São Paulo sem SQL**: o levantamento cobre a quadra inteira (o quarteirão entre as ruas) que a poligonal ocupa, mais os 30 m, com todos os lotes desenhados e numerados (número do lote e dígito; setor e quadra na lateral). Quadra acima de 6 ha e de 3 vezes o terreno fica de fora (dela, só os lotes perto do terreno). A escala é a mesma que o terreno teria sozinho, e a folha cresce para caber a quadra (A2, A1 ou A0, para plotter).
- **Do GeoSampa** (São Paulo): calçadas com a largura média, eixos com o nome da rua, a largura da via e do leito medida entre as calçadas, quadras, lotes, edificações (só no DXF), córregos (canalizado tracejado), corpos d'água e melhoramentos viários. No DXF vão também os pontos cotados do laser a cada 5 m (layer MALHA_COTAS) e o SQL de cada lote da quadra (NUMERO_LOTES).
- **Lotes da quadra** (São José dos Campos): todos os lotes das quadras do terreno, montados pelo GeoSanja, desenhados e numerados pelo número do lote (no DXF, a inscrição inteira, na layer TEXTO_LOTES; os lotes na layer LOTES_PREFEITURA). A quadra já montada no mapa de lotes vem do sistema na hora; senão, o passo "Lotes da quadra" leva alguns segundos.

**O que não dá hoje:**

- Os arquivos **não ficam guardados** no sistema enquanto a aba Documentos não existe: baixe-os na hora. Fechando a página, é preciso gerar de novo.
- O DXF não leva os pontos do Google, só as curvas com a cota.

## O que não é possível na ficha hoje

- Parte do estudo de viabilidade (ver [15](15-ficha-viabilidades.md)), o PDF e o DWG dos estudos de massa, as abas Jornada e Documentos, e guardar o PDF e o DXF do Topográfico em Documentos.
- Digitar o endereço (CEP, rua, bairro, município) direto: ele vem do mapa.
- Ver a ficha em tema escuro.
- Imprimir ou exportar a ficha.
