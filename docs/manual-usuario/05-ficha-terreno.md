# 05. Ficha: aba Terreno

**Disponível.** Ficha › aba **Terreno** (endereço `/terrenos/A123/terreno`).

## Para que serve

Guardar o que o terreno **é**: nome, endereço, quem são os donos (partes), as matrículas e os SQLs de cada um e as áreas. Os dados comerciais (valor, oferta, proposta) ficam na aba Comercial.

A aba tem, nesta ordem, os quadros: **Identificação**, **Endereço e localização**, **Parâmetros urbanísticos** (com os quadros Índices urbanísticos, Restrições e entorno e Histórico de uso; ver [07](07-ficha-parametros.md)), **Partes**, **Matrículas e SQLs** (com o quadro de cada parte), **Áreas e dimensões** e **IPTU**. Cada quadro abre e fecha pela seta do título. Todos os campos se editam no lugar (ver [04](04-ficha-visao-geral.md#editar-no-lugar)).

## Identificação

| Campo | Para que serve |
|---|---|
| **Nome de referência** | O nome pelo qual a equipe chama o terreno. Aparece no mapa, no funil e na busca. |
| **Descrição** | Texto livre sobre o terreno. |
| **Prioridade** | Baixa, Média, Alta ou Estratégica. |
| **Responsável** | Quem da BKM cuida do terreno. Recebe avisos. |
| **Origem do cadastro** | Prospecção própria, Corretor, Indicação, Portal, Proprietário direto ou Outro. |
| **Identificado em** | Data em que o terreno chegou. |
| **Observações gerais** | Texto livre. |

## Endereço e localização

**Regra:** **CEP, logradouro, bairro e município não se digitam na ficha.** Eles vêm da posição da poligonal no mapa. O CEP aparece no formato 00.000-000. Para mudar, use o lápis **"Editar no mapa"** (no título deste quadro ou ao lado do endereço no Resumo). Ele abre a página Mapa com a poligonal em edição.

**Por que:** o endereço precisa bater com o lugar do terreno no mapa e com os lotes da prefeitura. Digitado à mão, ele se descola do desenho.

**Planta do loteamento (São José dos Campos):** o botão **"Planta do loteamento"**, no título deste quadro, acha no GeoSanja a planta do loteamento aprovado onde o terreno está e baixa a imagem (JPG, a folha inteira). Quando mais de uma folha cobre o terreno, aparece a lista para escolher. Leva de 10 a 20 segundos. É a planta **da aprovação**, não o cadastro de hoje: lotes juntados ou desmembrados depois não aparecem nela. O arquivo só é baixado; ainda não fica guardado em Documentos.

Depois de salvar uma poligonal nova, se a rua do terreno não encosta mais nela, aparece a pergunta **"Trocar o endereço?"**:

- **"Manter o endereço"**: fica como estava.
- **"Trocar o endereço"**: abre o passo do cadastro com o acesso principal e o nome de referência (com o nome atual e a sugestão pelo endereço novo); em São Paulo, depois, o mapa de lotes da prefeitura com os SQLs do terreno marcados (**"Gravar e conferir os lotes"**), que refaz os SQLs e as consultas do GeoSampa. Tudo isso volta com um Ctrl+Z.

Campos que **se editam** no lugar:

| Campo | Observação |
|---|---|
| **Número** | Só informativo: não mexe no pino nem na poligonal. Se for diferente dos números de porta dos SQLs do terreno, aparece **"Número diferente do cadastro da prefeitura"** ("O número informado diverge dos números cadastrados no município para os lotes selecionados"), com **Cancelar** e **"Alterar mesmo assim"**. |
| **Complemento** | Texto livre. |
| **Zona** | Norte, Sul, Leste, Oeste, Centro, Sudeste, Sudoeste, Nordeste, Noroeste. Em São Paulo vem sozinha do GeoSampa ao abrir a ficha e aparece marcada "do GeoSampa": é a região oficial da prefeitura (Centro, Norte, Sul, Leste ou Oeste) da subprefeitura onde fica a maior parte da poligonal. Enquanto busca, um círculo girando aparece ao lado do nome do campo. Se você trocar, vale o que você escolheu, e o GeoSampa não sobrescreve mais. A zona que já estava escolhida antes desta busca existir também não é trocada. |
| **Cartório de registro de imóveis** | Em São Paulo vem do GeoSampa e aparece marcado "do GeoSampa": pela poligonal (a circunscrição que cobre a maior parte do terreno) ao abrir a ficha, mesmo sem SQL. Enquanto busca, um círculo girando aparece ao lado do nome do campo. Se você trocar, vale o que você escolheu, e o GeoSampa não sobrescreve mais. |
| **Referência** | Ponto de referência ("em frente ao mercado X"). |

## Partes

**Para que serve:** dizer quem vende. Cada **parte** é um grupo de donos que negocia junto (ver [Conceitos](00-conceitos.md#partes)).

**Regra:** todo terreno nasce com uma parte, **"Vendedor 1"**.

- **"Quantas partes vendem?"** com **−** e **+**: tira ou acrescenta partes.
- **"Adicionar parte"**: cria uma parte nova.
- Cada parte é um cartão com o título, a contagem de matrículas e, na mesma linha, os ícones de **lápis** e **lixeira**. Embaixo, a lista dos proprietários (nome e %), ou "Nenhum proprietário informado".

### Pessoas da parte (lápis)

O lápis abre a janela **"Editar pessoas da parte"**: o formulário em cima e a tabela de todas as pessoas embaixo, com editar e tirar.

| Campo | Regra |
|---|---|
| **Título da parte** | Obrigatório, sem repetir outro título do terreno. |
| **Nome** | Obrigatório. |
| **Telefone** | Opcional. Se preencher, com DDD (10 ou 11 dígitos). |
| **E-mail** | Opcional. Se preencher, precisa ser válido. |
| **CPF/CNPJ** | Opcional. Se preencher, 11 dígitos (CPF) ou 14 (CNPJ). |
| **% de participação** | Obrigatória para quem é Proprietário, de 0 a 100%; nas outras relações fica desligada. |
| **Relação** | Proprietário, Cônjuge, Representante, Procurador, Parente, Contato ou Outros. |

Do proprietário, só o **nome** e a **participação** são obrigatórios; o resto pode ficar em branco e completar depois, sem contar como pendência da ficha.

**Dica:** cadastre também o procurador e o contato do dia a dia, não só os donos. O item "Proprietário" da completude só sai da lista do que falta quando **cada parte** tem proprietários somando **100%** de participação; enquanto alguma parte estiver abaixo disso, ele continua em "Falta preencher".

### Excluir uma parte (lixeira)

A lixeira exclui a parte. As matrículas e SQLs dela voltam a ficar soltos.

## Matrículas e SQLs

**Para que serve:** ligar o terreno aos documentos (matrícula no cartório) e aos lotes da prefeitura (SQL ou inscrição), e dizer de qual parte é cada um.

O quadro tem duas metades:

- **Matrículas**: digite o **Nº da matrícula**, confira o **Cartório** (já vem preenchido) e a **Área registrada**, e clique em **Incluir**. Vira uma etiqueta **amarela**.
- **SQLs** (ou o nome da inscrição na sua cidade): digite e clique em **Incluir**, ou use **"Escolher no mapa"**. Vira uma etiqueta **roxa**.

**Em São José dos Campos**, a inscrição imobiliária é consultada sozinha no **GeoSanja** assim que é incluída: vêm a poligonal do lote, a zona com a área no lote, a macrozona e as restrições (centralidade, setor, riscos, parques, linha de transmissão...), e a poligonal do terreno é refeita pela soma dos lotes, como em São Paulo. A janela da etiqueta tem **"Buscar no GeoSanja"** (ou **"Buscar de novo"**). O GeoSanja **não traz** área cadastral, endereço e número, testada, valor venal nem IPTU: esses você digita (na janela da etiqueta e na aba Terreno). O **cartório** (1º ou 2º Registro de Imóveis) e a **Zona** (região da cidade pela LC 612: Centro, Norte, Sul, Leste, Oeste ou Sudeste) vêm sozinhos do GeoSanja pelo ponto do terreno, ao abrir a ficha, e o que você digitar não é trocado. Nos Índices urbanísticos, fora de São Paulo, aparecem um **Potencial** e um **CA máximo** só (a lei da cidade não separa HIS e HMP). **"Escolher no mapa"** também existe em São José: abre o mapa de lotes do GeoSanja das quadras da poligonal (ver [03](03-novo-terreno.md#lotes-da-prefeitura-são-paulo-e-são-josé-dos-campos)); as marcadas entram sem parte e as desmarcadas das quadras abertas saem.

Cada etiqueta mostra o número e um **x**. Em tela estreita, as duas metades ficam uma sobre a outra e cada uma recolhe pela seta.

Embaixo vem **um quadro por parte**, numa grade, com a seta que abre e fecha a linha inteira.

### Levar as etiquetas para as partes

**Arraste** a etiqueta da área de cima para o quadro da parte, ou de uma parte para outra.

**Várias de uma vez** (no computador): clique num espaço vazio da seção e arraste o mouse; um retângulo azul aparece e as etiquetas que ele toca ficam **selecionadas** (contorno azul). Para somar etiquetas à seleção, segure **Ctrl** (⌘ no Mac) ou **Shift** e clique nelas, ou desenhe outro retângulo com a tecla apertada. Depois arraste **qualquer uma das selecionadas**: vão todas juntas, com o número delas no canto da etiqueta que você leva. As regras abaixo valem para cada uma; as que não puderem entrar ficam onde estavam, e o aviso diz quantas foram e por quê. Matrículas e SQLs podem ir no mesmo grupo: as matrículas entram primeiro, e os SQLs vão para dentro delas quando a parte fica com uma matrícula só. **Ctrl+Z** desfaz o grupo inteiro de uma vez. Clique no vazio ou **Esc** limpa a seleção.

**Regras:**

- Cada **matrícula** levada a uma parte vira um **subquadro amarelo** dela.
- O **SQL entra sempre dentro de uma matrícula.** Solto sobre uma parte com uma matrícula só, vai para ela; com mais de uma matrícula, solte sobre a matrícula certa. Parte sem matrícula recusa o SQL com o aviso **"É necessário atribuir uma matrícula à parte antes de lançar lotes nela"**.
- Mover ou tirar a matrícula leva ou solta os SQLs dela junto.
- Com uma parte só, o botão **"Enviar tudo para Vendedor 1"** faz tudo de uma vez.

### Menu da etiqueta (clique direito)

- **Duplicar**: cria uma cópia no mesmo lugar da original. Serve quando o mesmo lote é de mais de uma parte. A cópia nasce com o que falta para 100% (ou com 0% e um alerta, se o lote já está todo nas outras partes).
- **Mover para** (ou **Pôr em**, se está sem parte): leva a etiqueta para outra parte.
- **Editar**: abre a janela da etiqueta.
- **Tirar da parte**: devolve para a área de cima. Se o lote está em outras partes, a etiqueta fica solta com o percentual dela; o **x** de uma cópia solta a apaga.

### Percentual (a mini pizza)

Toda etiqueta mostra uma **mini pizza** com a fração dela: cheia em 100%, tracejada quando o percentual é estimado, vermelha com alerta em 0%. Parar o mouse mostra "N% · Clique para editar".

- **Clique na pizza**: abre uma barra vertical para arrastar e um campo pequeno. Grava na hora.
- O percentual é **opcional**. Sem ele, o que falta para 100% se divide igual entre as partes sem percentual.

**Para que serve:** a **área da parte** = soma de (área do SQL × % do SQL × % da matrícula). Sem SQL, usa a área das matrículas.

### Janela da etiqueta (lápis ou clique)

Para uma matrícula: número, cartório, área registrada, as partes deste lote com o percentual de cada uma. Botão **Concluir**.

Para um SQL, também:

- **GeoSampa**: **"Buscar no GeoSampa"** (ou "Buscar de novo") traz do GeoSampa o lote, a área cadastral, as zonas e as restrições. Só funciona na versão publicada. Se o GeoSampa não achar o lote, aparece "O GeoSampa não achou o lote deste SQL."
- **Valor venal e IPTU**: em São Paulo vem sozinho da Prefeitura (ver IPTU, abaixo) e não se digita. Fora de São Paulo, **"Lançar IPTU"** (ou "Atualizar IPTU") com Exercício, Venal terreno, Venal construção, Situação (Tributado ou Isento), IPTU anual, Parcelas e Fonte ("Carnê, certidão de dados cadastrais...").

**Regra do IPTU:** só vale o exercício mais recente. Lançar o ano novo substitui o anterior (o anterior fica no histórico); lançar um ano mais antigo é recusado.

### Efeitos de incluir ou tirar SQL

- **Cada SQL incluído ou excluído refaz a poligonal** pela soma dos lotes da prefeitura. Sem nenhum SQL com lote, a poligonal volta a ser a desenhada.
- Lotes que não se encostam deixam a poligonal como estava ("Os lotes dos SQLs não se encostam").
- Tirar um SQL com IPTU lançado tira o IPTU junto (o sistema avisa antes).
- A **área cadastral** do terreno é refeita (ver Áreas abaixo).

### Matrícula ou SQL de outro terreno

Se a matrícula ou o SQL já está em outro terreno, o sistema não deixa incluir e mostra qual é, com:

- **"Abrir"**: abre a ficha do outro terreno.
- **"Registrar nova oferta"**: abre a janela de oferta na aba Comercial daquele terreno.

**Regra:** cartório em branco conta como o mesmo cartório.

### Pé de cada parte

Mostra a **área da parte** e a **divergência Matrícula × Prefeitura** (a área cadastral dos SQLs comparada com a das matrículas).

## Áreas e dimensões

Quatro cartões de área, nesta ordem: lado a lado quando cabem, senão em dois pares (Documental e Cadastral em cima, Topográfica e Poligonal embaixo).

| Cartão | De onde vem |
|---|---|
| **Documental** | Digitada (da matrícula). |
| **Cadastral** | Em São Paulo, não se digita: é a soma das áreas dos SQLs do terreno (só quando todos têm área), refeita a cada SQL incluído, excluído ou consultado; uma área digitada antes volta para a soma ao abrir a ficha. Nas outras cidades, digitada. |
| **Topográfica** | Digitada (levantamento topográfico). **Ao digitar ou trocar o valor, vira a área adotada**, mesmo que outra tivesse sido escolhida (pode trocar depois). |
| **Poligonal** | Calculada pelo desenho, em m² inteiros. Nunca se digita. Muda quando a poligonal é ajustada. |

**Área adotada:** todo terreno nasce com a **Cadastral** como adotada (enquanto os SQLs não trazem a área, aparece "Cadastral · sem área ainda"). A única que toma o lugar sozinha é a **Topográfica**, quando é digitada. Para escolher outra, clique num cartão preenchido; a adotada fica em azul com "Área adotada". Se a área escolhida é apagada, a adotada volta para a Cadastral. Se a adotada é a Poligonal, ela acompanha cada ajuste do desenho. Não há mais área estimada.

Abaixo:

- **Testada principal** (em metros): em São Paulo não se digita, é a frente do acesso principal medida pela poligonal (abaixo); nas outras cidades, digitada (duas casas, maior que zero).
- **Valor pedido por m²**: calculado (valor pedido ÷ área adotada).

Se as áreas diferem mais de 1% entre si, aparece um aviso.

### Posição na quadra e frentes (São Paulo)

Em São Paulo, o sistema mede sozinho, pela poligonal, **para quais ruas o terreno dá frente** e **quantos metros de divisa dão para cada uma**, usando os lotes e as ruas da prefeitura (GeoSampa). Isso vale para o terreno inteiro, não lote a lote: dois lotes de meio de quadra lado a lado dão uma frente só, e um lote de esquina mais um de meio de quadra dão um terreno de esquina.

- **Posição na quadra**: Meio de quadra (uma rua), Esquina (duas ruas que se encontram num canto do terreno), Duas frentes (ruas que não se encontram, como frente e fundos) ou Quadra inteira (três ruas ou mais e quase todo o contorno dando para rua).
- **Frentes**: uma linha por rua, com os metros de frente. A rua do endereço aparece como "acesso principal". Na esquina, o canto conta para as duas ruas.
- **Quando mede**: ao cadastrar o terreno, a cada mudança da poligonal (desenho, SQLs incluídos ou tirados) e, nos terrenos antigos, na primeira vez que a aba Terreno é aberta por quem edita.
- **Testada principal**: é sempre a frente do acesso principal e acompanha cada medição.
- **Fora de São Paulo** não mede: a testada principal se digita.
- No computador de desenvolvimento (fora da versão publicada), não mede.

## IPTU

Logo abaixo de Áreas e dimensões. Nasce fechado, como os outros quadros da aba (abre pela seta do título). Em cima, o **Panorama do terreno**, a soma de todos os SQLs:

- três caixas, como as de Áreas e dimensões: **valor venal do terreno**, **da construção** e **total**, este em destaque (três por linha, também na gaveta da ficha);
- embaixo, em dupla: **área total do terreno** e **área construída** (da Prefeitura);
- por último, em destaque: **IPTU anual** e **IPTU mensal** (anual ÷ 10, as 10 prestações da Prefeitura).

O título do panorama diz o exercício e quantos SQLs ainda não têm IPTU. Em **Ver SQL por SQL**, uma linha por SQL: exercício, venal do terreno, venal da construção, venal total, IPTU anual, mensal e a fonte com a data.

- **Em São Paulo o IPTU vem sozinho**: ao cadastrar o terreno, ao incluir um SQL (digitado, pelo mapa de lotes ou em Selecionar lotes) e ao abrir a ficha de um SQL que ainda não tem o IPTU da Prefeitura, o sistema emite a notificação de lançamento (a "2ª via") no site da Prefeitura e grava o venal e o IPTU do exercício. Isso corre por trás: dá para continuar cadastrando. Enquanto não chega, a seção IPTU fica apagada, com um brilho passando e "Buscando o IPTU na Prefeitura: N de M SQLs". Cada SQL leva até um minuto, um de cada vez. Se a Prefeitura não tiver a notificação do ano ainda, vem a do ano anterior. Em São Paulo o valor venal e o IPTU **não se digitam**.
- Se a busca de um SQL falha, o motivo aparece na coluna Fonte do SQL por SQL. **Buscar de novo** (no título do quadro, ou "Buscar" em cada linha; só quem edita) tenta outra vez.
- **Detalhe** (na linha trazida da Prefeitura): número da notificação, área do terreno, testada, área construída, uso, padrão, ano da construção, valor do m² do terreno e da construção, fatores, alíquota, descontos, impostos predial e territorial, total do ano e vencimento da 1ª prestação.
- **PDF** (na mesma linha): emite a notificação e baixa o PDF, mesmo antes de o valor ter sido trazido (aí vale o exercício do ano corrente).
- Buscar de novo no mesmo ano com os mesmos valores não muda nada; com valores diferentes, vira uma correção (a anterior fica no histórico).
- **Fora de São Paulo** não há busca: o valor venal e o IPTU se digitam em **Lançar** (ou **Atualizar**) na linha de cada inscrição, na lista "Ver inscrição por inscrição", que já vem aberta, ou na janela da inscrição (Matrículas e SQLs), onde o formulário já vem aberto enquanto não há IPTU lançado.
- O que pode dar errado: a Prefeitura pedir captcha ("Tente mais tarde"), recusar a senha do sistema, não ter notificação para o SQL, ou o site estar fora. A mensagem aparece embaixo da tela.

## O que não é possível na aba Terreno

- Digitar CEP, logradouro, bairro e município (só pelo mapa).
- Em São Paulo, digitar a testada (vem da medição pela poligonal) e a área cadastral (soma dos SQLs).
- Características físicas (formato, ocupação, demolição) e confrontações de divisa: **saíram da ficha** por decisão. As frentes voltaram, medidas pela poligonal (acima).
- A seção antiga "Proprietários e contatos": foi para dentro das partes.
- Buscar o GeoSampa num computador de desenvolvimento (só na versão publicada).
- Arrastar etiquetas no celular sem segurar antes (o celular ainda não foi revisado).
