# 04. Ficha do terreno: topo, abas e Visão geral

**Disponível.** A ficha abre de três jeitos:

- na **gaveta** da página Mapa (clique no pino, na poligonal ou na lupa da linha; endereço `/mapa/A123/ficha`);
- em **página própria** (botão "Abrir página" na gaveta, ou endereço `/terrenos/A123`);
- pelo **Funil**, clicando no card do terreno.

## Para que serve

A ficha reúne tudo sobre um terreno: onde fica, de quem é, quanto pedem, o que a lei deixa construir, o que tem em volta, em que etapa está a negociação e o histórico de tudo que mudou.

## Como a ficha é organizada

De cima para baixo:

1. **Linha do tempo** das etapas (ou das fases, depois da compra), com a data de entrada em cada uma.
2. **Topo**: código, nome, **fase · etapa · subetapa**, "Cadastrado em", **temperatura**, **responsável** e **"Ficha N% completa"**.
3. **Barra das abas**, que fica presa no alto ao rolar.
4. O conteúdo da **aba** escolhida.
5. À direita, o **painel** com o quadro de avanço e Ações, Tarefas e Logs (ver [09](09-avanco-e-logs.md)).

Com mais de uma fase aberta, o topo mostra a mais adiante.

## Temperatura

A temperatura diz o quanto o terreno está promissor para a BKM. São 5 barras: **Muito fria, Fria, Morna, Quente, Muito quente**. Clique na barra para escolher; clicar de novo na mesma barra apaga (volta a "Temperatura não avaliada").

**Regra:** a temperatura é do **terreno**, uma só, e aparece sempre, também no Backlog (terreno ainda sem oferta). Ela continua quando a negociação abre, muda de etapa ou termina. Quem tem só consulta vê, mas não muda. A mudança vai para os Logs, e cliques seguidos viram um log só; a lixeira não desfaz a temperatura (é só clicar de novo).

## "Ficha N% completa"

Mostra quanto dos 11 itens que importam para decidir a compra está preenchido. A bolinha vermelha diz quantos faltam. Clique para ver a lista; escolha um item e o sistema **abre a aba, abre o campo em edição e rola até ele**, que acende em verde-limão por um instante.

Quem edita pode **descartar** um item que não se aplica àquele terreno: o **x** ao lado do item tira ele da lista e da conta do percentual, só neste terreno. O descarte fica no **Log** ("Descartado do Falta preencher: Testada"), e o fim do menu mostra **"Descartados (N)"** com **"Voltar a pedir"**. Ctrl+Z também desfaz.

Os 11 itens:

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
| Valor pedido | Comercial › Condições pedidas (ou registrar oferta) |
| Temperatura | Topo da ficha |

Quando você rola e o topo sai da vista, a barra das abas mostra um **botão de alerta** com a bolinha vermelha, que abre a mesma lista.

**Visita técnica** não entra na conta enquanto a aba Infraestrutura não existir no sistema real (ela só está no protótipo): antes, ela deixava toda ficha presa abaixo de 100% sem ter onde preencher. Volta para a lista quando a aba for portada.

## Barra das abas

As abas, nesta ordem: **Visão geral, Terreno, Comercial, Estudos de massa, Viabilidades, Infraestrutura, Entorno, Jornada, Documentos**.

| Aba | Situação | Seção do manual |
|---|---|---|
| Visão geral | Disponível | esta |
| Terreno | Disponível | [05](05-ficha-terreno.md) |
| Comercial | Disponível | [06](06-ficha-comercial.md) |
| Parâmetros urbanísticos | Disponível, como seção da aba Terreno | [07](07-ficha-parametros.md) |
| Entorno | Disponível | [08](08-ficha-entorno.md) |
| Infraestrutura | Só o quadro **Relevo**, com o **Topográfico** fora de São Paulo (veja abaixo) | esta |
| Viabilidades | Disponível em parte: lista, Resumo da viabilidade e a seção Tipologias do estudo | [14](14-ficha-viabilidades.md) |
| Estudos de massa, Jornada, Documentos | **Ainda não disponível** (mostram "Esta aba entra depois da primeira versão") | [12](12-ainda-nao-disponivel.md) |

**Como andar pelas abas:**

- Clique na aba.
- A barra é uma faixa contínua, como uma roleta: as abas das pontas aparecem cortadas pela borda. Para rolar a faixa sem trocar de aba: **Shift + roda do mouse**, deslize de lado no trackpad, ou **arraste com o mouse** (com o mouse em cima, o cursor é o dedinho, como em qualquer botão; vira mão fechada enquanto você segura o botão do mouse). Solta com força, ela continua rodando e freia aos poucos.
- As **setas** no fim da barra vão para a aba anterior e a próxima.
- O **⋮ "Mais ações"** lista todas as abas, com a atual marcada.

Cada aba tem seu endereço (`/terrenos/A123/comercial`), então dá para mandar o link direto para uma aba.

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
| **Unidades do estudo válido** e **VGV do estudo válido** | Do estudo de viabilidade válido (unidades somadas das tipologias e VGV bruto) | Aba Viabilidades (a seta leva lá); vazias enquanto nenhum estudo for o válido. Ver [14](14-ficha-viabilidades.md). |
| **Distância do metrô ou trem** | Estação mais próxima, minutos a pé | Automático (aba Entorno). |
| **Valor pedido na entrada** | Valor da **primeira** oferta, com a data | Aba Comercial. |
| **Perfil topográfico** | Plano, Inclinado, Acidentado... | A medição automática ainda não está no sistema real; a seta leva à aba Infraestrutura, onde está o Topográfico. |
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

## Excluir ou deletar o terreno

Só para **diretor** e **administrador**: no topo da ficha, à direita do responsável (na gaveta do Mapa, ao lado do ícone **Abrir página**), fica o botão **⋮ Mais ações**. Para os outros papéis o botão não aparece.

- **Excluir terreno** (diretor e administrador): pede confirmação e tira o terreno de todos os lugares para todos: lista, mapa, funil (inclusive o Backlog), busca, tarefas e avisos do sino. Nada é apagado: o terreno fica guardado por **180 dias** e o administrador pode **restaurar** nesse prazo, voltando com tudo (negociação, propostas, tarefas). Passados os 180 dias, o sistema apaga de vez sozinho.
- **Deletar de vez** (só administrador): apaga **na hora** o terreno e tudo o que é dele (partes, matrículas e SQLs, negociação, ofertas, propostas, reuniões, estudos, documentos, tarefas e o histórico). Não passa pela lista de excluídos e **não tem volta**. A janela mostra o aviso e só libera o botão depois que você digita o nome do terreno (maiúsculas e espaços a mais não importam). Quando os documentos forem para o Google Drive, as pastas do terreno também serão apagadas.

Enquanto o terreno está excluído, a matrícula e os SQLs dele continuam presos a ele: tentar incluí-los em outro terreno mostra "está num terreno excluído". Para usar o número noutro terreno, o administrador restaura ou deleta o excluído.

## Topográfico preliminar (aba Infraestrutura)

**Para que serve:** ter uma planta com as curvas de nível do terreno e da vizinhança para o estudo, antes do levantamento de campo.

**Onde:** aba **Infraestrutura**, quadro **Relevo**, botão **Topográfico** (aparece quando o terreno tem poligonal).

1. Clique em **Topográfico**. A janela explica de onde vem cada coisa.
2. Clique em **Gerar topográfico**. A janela mostra cada passo enquanto trabalha (contorno, cotas, curvas, imagem, PDF e DXF).
3. No fim aparece a prévia da folha. Baixe o **PDF** (folha A3 para imprimir) ou o **DXF + imagem (.zip)** (para o AutoCAD, com o mesmo PDF dentro).

**De onde vem:**

- **Contorno**: em São José dos Campos, a soma dos lotes do GeoSanja quando todas as inscrições têm o lote; senão, a poligonal desenhada.
- **Cotas**: do Google, um ponto a cada 5 m, com curvas de 1 em 1 m e mestra de 5 em 5 m. O erro típico é de 3 a 4 m: serve para estudo, não para projeto.
- **Imagem por trás**: o satélite do Google com os nomes das ruas, para você reconhecer as ruas e a vizinhança.
- O levantamento cobre o terreno e 30 m em volta.
- **Lotes da quadra** (São José dos Campos): todos os lotes das quadras do terreno, montados pelo GeoSanja, desenhados e numerados pelo número do lote (no DXF, a inscrição inteira, na layer TEXTO_LOTES; os lotes na layer LOTES_PREFEITURA). A quadra já montada no mapa de lotes vem do sistema na hora; senão, o passo "Lotes da quadra" leva alguns segundos.

**O que não dá hoje:**

- **São Paulo**: lá as cotas vêm sempre do laser da prefeitura, nunca do Google, e essa parte ainda não está no sistema novo. O botão abre a janela com esse aviso.
- Os arquivos **não ficam guardados** no sistema enquanto a aba Documentos não existe: baixe-os na hora. Fechando a página, é preciso gerar de novo.
- O DXF não leva os pontos do Google, só as curvas com a cota.

## O que não é possível na ficha hoje

- As abas Estudos de massa, Jornada e Documentos, parte do estudo de viabilidade (ver [14](14-ficha-viabilidades.md)), e o resto da aba Infraestrutura (visita técnica, viabilidades técnicas).
- Digitar o endereço (CEP, rua, bairro, município) direto: ele vem do mapa.
- Ver a ficha em tema escuro.
- Imprimir ou exportar a ficha.
