# 01. Entrar e se localizar

## Entrar no sistema

**Disponível.**

1. Abra o endereço do sistema (ver [Endereços](README.md#endereços)).
2. Clique em **"Entrar com o Google"**.
3. Escolha sua conta **@bkm.com.br**. Outras contas do Google não entram.

Na primeira vez, a pessoa entra com o papel **Básico** (só consulta) até um administrador promovê-la. Se o cadastro dela ainda não foi feito, aparece a tela **"Seu acesso ainda não foi liberado"**, com os botões **"Sair"** e **"Tentar de novo"**. Peça a liberação ao Moises ou ao Rafael e depois clique em "Tentar de novo".

**Dica:** se alguém mandou um link (por exemplo, `/terrenos/A123/comercial`) e você ainda não estava logado, o login aparece no próprio link e, ao entrar, a tela pedida abre direto.

## A moldura: o que fica sempre na tela

### Menu lateral (à esquerda)

Na primeira versão o menu tem:

- **Botão "Novo terreno"** (o botão de criar, no alto do menu): abre o cadastro de terreno. Ver [03. Novo terreno](03-novo-terreno.md).
- **Mapa**: a página com o mapa e a lista de terrenos. Ver [02. Mapa](02-mapa.md).
- **Funil**: o quadro das fases, etapas e subetapas. Ver [10. Funil](10-funil.md).
- **Corretores**: a lista dos corretores, com a ficha de cada um. Ver [17. Corretores](17-corretores.md).

O menu começa recolhido, só com os ícones e um rótulo pequeno embaixo. O botão no topo do menu abre e fecha; o sistema lembra a escolha no seu navegador.

**Ainda não disponível:** Início, Tarefas, Terrenos (tabela Pipeline), Dashboard e Configurações existem só no protótipo. Ver [12](12-ainda-nao-disponivel.md).

### Barra de cima

Da esquerda para a direita:

- **Logo da BKM.** No ambiente de desenvolvimento, ao lado do logo aparece o selo **"Desenvolvimento"** e, embaixo dele, **"PR #N · dia hora"**: é a versão que está no ar. Serve para saber se uma mudança já chegou. Na produção o selo não aparece.
- **Busca** (campo "Buscar por nome, endereço, matrícula, SQL ou corretor").
- **Sino** de avisos.
- **Avatar** (sua foto). O menu dele mostra seu nome e papel, **Terrenos excluídos** (só para o administrador; ver abaixo) e **Sair**.

A barra ocupa a largura toda da tela, em qualquer tamanho de monitor: o logo fica alinhado com o menu lateral e o avatar fica no canto direito, com a mesma margem do logo.

### Terrenos excluídos (administrador)

No menu do avatar, **Terrenos excluídos** lista os terrenos que um diretor ou administrador excluiu, do mais recente ao mais antigo, com quem excluiu, quando e o dia em que serão apagados de vez (180 dias depois). Cada linha tem **Restaurar** (o terreno volta para a lista, o mapa e o funil, com tudo o que tinha) e **Deletar de vez** (o mesmo aviso e o nome digitado da ficha). Quando a tela de Configurações chegar ao sistema, esta lista passa para lá. Ver também [Excluir ou deletar o terreno](04-ficha-visao-geral.md#excluir-ou-deletar-o-terreno).

### Busca de cima

O campo filtra a **lista de terrenos da página Mapa** (e os pinos) pelo código, nome, endereço (rua, número e CEP), bairro, zona, município, corretor, **número da matrícula** e **SQL / inscrição**. Digitado em outra página, ele leva ao Mapa já com o texto.

- Com várias palavras, o terreno precisa ter todas ("itapura 120").
- Acento não importa ("tatuape" acha "Tatuapé").
- Matrícula e SQL valem com ou sem pontos e traço: "030.045.0012-3", "03004500123" e um pedaço como "0450012" acham o mesmo SQL; "12345" acha a matrícula "12.345". Para números sem pontuação é preciso digitar pelo menos 3 dígitos.

### Sino de avisos

**Disponível.** O sino mostra um número vermelho com os avisos não lidos. Os avisos chegam na hora (sem recarregar a página) e também são conferidos a cada minuto. Cada aviso diz o terreno, a data e quem fez.

- Clicar num aviso o marca como lido e abre a ficha do terreno na aba certa: reunião, proposta e oferta abrem a aba **Comercial**; o resto abre a **Visão geral**.
- **"Marcar todas como lidas"** limpa o número.

**Ainda não disponível:** aviso por e-mail e WhatsApp. Hoje o aviso é só no sino.

### Menu do avatar

Clique na sua foto para ver seu nome, seu @ (o texto antes do @ do seu e-mail), seu papel e o botão **"Sair"**.

**Ainda não disponível:** escolha do tema (claro, escuro), preferências de e-mail e o "Entrar como" do protótipo. A primeira versão funciona só no tema claro.

## Endereço de cada tela

Toda tela tem seu próprio endereço, e o link copiado do navegador abre a mesma tela para um colega:

| Endereço | O que abre |
|---|---|
| `/mapa` | Página Mapa |
| `/mapa/A123` | Mapa com o terreno A123 selecionado |
| `/mapa/A123/ficha` | Mapa com a ficha do A123 aberta na gaveta |
| `/terrenos/novo` | Cadastro de terreno |
| `/terrenos/A123` | Ficha do A123 (Visão geral) |
| `/terrenos/A123/terreno`, `/comercial`, `/entorno` | Ficha na aba indicada (`/parametros`, endereço antigo, abre a aba Terreno) |
| `/funil` | Funil, nível das fases |
| `/funil/<fase>` e `/funil/<fase>/<etapa>` | Funil descendo para etapas e subetapas |

Os botões de voltar e avançar do navegador funcionam entre telas. Links antigos (`/cadastro`, `/negociacao`, `/urbanismo`, `/fases`) caem na tela nova equivalente.

## Comportamentos que valem em todo o sistema

### Campos com máscara

- Números formatam enquanto você digita: milhar com ponto, vírgula decimal.
- A unidade aparece dentro do campo: **R$** antes; **%**, **m** e **m²** depois.
- Valores aceitam abreviações: **"270 mil"** e **"12 mi"** viram 270.000 e 12.000.000.
- Medidas em metros (testada, recuos) ficam com duas casas, completadas ao sair do campo.
- Enquanto você digita, o que falta do formato aparece em cinza depois do texto (",00" no percentual; o resto do desenho do telefone, CPF, CNPJ ou CEP).

### Teclado nos campos

- **Enter** passa para o próximo campo, como o Tab. No último campo do formulário, grava.
- **Esc** volta o valor que estava antes, sem gravar.
- O primeiro clique num campo de texto ou número **seleciona todo o conteúdo** (para substituir digitando). O segundo clique põe o cursor onde você clicou.

### Campo obrigatório em branco

O sistema não usa o balão do navegador. O campo fica vermelho com o aviso embaixo, a seção que o contém abre, a página rola até ele e um aviso na parte de baixo da tela diz qual campo falta.

### Edição no lugar, sem botões Editar e Salvar

Na ficha, quem pode editar já vê os valores como campos com cara de texto (a linha do campo aparece ao passar o mouse). **Cada campo grava sozinho** ao sair dele ou ao escolher uma opção na lista. Não existe botão Salvar. Ver [04](04-ficha-visao-geral.md#editar-no-lugar).

### Desfazer e refazer (Ctrl+Z e Ctrl+Y)

**Disponível na ficha e na poligonal.**

- **Ctrl+Z** (⌘Z no Mac), com o cursor **fora** de um campo, desfaz a última alteração que **você** fez nesta sessão, uma por vez. Aparece o aviso **"Desfeito: …"**.
- **Ctrl+Y** (ou Ctrl+Shift+Z) refaz o que foi desfeito, com o aviso **"Refeito: …"**.
- Uma alteração nova apaga a lista do que havia para refazer.

O que entra: campos da ficha (inclusive a área adotada), etiquetas de matrícula e SQL (parte, percentual e dados da janela), ajustes da poligonal e troca de SQLs pelo "Selecionar lotes".

O que **não** entra: movimentos no funil (avançar etapa, Stand By, Perdido...), registros (oferta, proposta, reunião) e exclusões. Para esses, faça o movimento contrário à mão. Fechar a aba do navegador apaga a lista do Ctrl+Z.

### Rascunhos de formulários

Os formulários de inclusão (registrar oferta, proposta, reunião, zonas, matrícula, SQL, IPTU, pessoa da parte) guardam no seu navegador o que você está digitando, por terreno e por formulário. Se você fechar o formulário, a aba ou o navegador, o texto volta quando reabrir. O rascunho nunca expira; só sai quando você registra ou clica em **"Limpar dados"** do formulário (na janela das pessoas da parte, ele fica ao lado do título, por exemplo "Pessoas · Vendedor 1").

Por isso, sair do formulário sem registrar (clicar noutro botão, trocar de aba, fechar a janela, sair da página ou clicar em **"Cancelar"**) não pergunta nada: o que você digitou continua guardado e volta quando reabrir o formulário.

**Regra:** o rascunho fica no navegador daquele computador. Num computador diferente ele não aparece.

### Mover as janelas (pop-ups) pela tela

Toda janela que abre por cima da tela (perguntas como "Trocar o endereço?", formulários, a tabela completa de um concorrente, o mapa de lotes da prefeitura) e os quadros que abrem sobre o mapa (setor censitário, card da concorrência, rota) podem ser **arrastados pelo título** para ver o que está atrás. O cursor vira uma mãozinha sobre o título; segure e arraste (no celular, segure o título com o dedo e arraste).

- Enquanto você arrasta, o fundo escurecido some. Depois de movida, a janela fica flutuando: você pode usar a tela de baixo (clicar, rolar, mexer no mapa) e ela continua aberta. Ela só fecha no X, no Esc ou nos botões dela.
- Sem mover, a janela continua como antes: o fundo escurecido cobre a tela e clicar fora dela a fecha.
- O X de fechar nunca sai da tela.
- **Dois cliques no título** devolvem a janela ao lugar de origem.
- Cada janela abre sempre no lugar padrão; a posição não fica guardada.

## Celular

**Ainda não revisado.** A primeira versão é para computador. No celular a maior parte abre, mas há telas que não foram ajustadas (por exemplo, o toque longo para editar a poligonal ainda não existe no sistema real). Use o computador para o trabalho do dia a dia.
