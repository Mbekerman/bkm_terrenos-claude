# 05. Ficha: aba Terreno

**Disponível.** Ficha › aba **Terreno** (endereço `/terrenos/A123/terreno`).

## Para que serve

Guardar o que o terreno **é**: nome, endereço, quem são os donos (partes), as matrículas e os SQLs de cada um e as áreas. Os dados comerciais (valor, oferta, proposta) ficam na aba Comercial.

A aba tem, nesta ordem, os quadros: **Identificação**, **Endereço e localização**, **Partes**, **Matrículas e SQLs** (com o quadro de cada parte) e **Áreas e dimensões**. Cada quadro abre e fecha pela seta do título. Todos os campos se editam no lugar (ver [04](04-ficha-visao-geral.md#editar-no-lugar)).

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

**Regra:** **CEP, logradouro, bairro e município não se digitam na ficha.** Eles vêm da posição da poligonal no mapa. Para mudar, use o lápis **"Editar no mapa"** (no título deste quadro ou ao lado do endereço no Resumo). Ele abre a página Mapa com a poligonal em edição.

**Por que:** o endereço precisa bater com o lugar do terreno no mapa e com os lotes da prefeitura. Digitado à mão, ele se descola do desenho.

Depois de salvar uma poligonal nova, se a rua do terreno não encosta mais nela, aparece a pergunta **"Trocar o endereço?"**:

- **"Manter o endereço"**: fica como estava.
- **"Trocar o endereço"**: abre o passo do cadastro com o acesso principal e o nome de referência (com o nome atual e a sugestão pelo endereço novo); em São Paulo, depois, o mapa de lotes da prefeitura com os SQLs do terreno marcados (**"Gravar e conferir os lotes"**), que refaz os SQLs e as consultas do GeoSampa. Tudo isso volta com um Ctrl+Z.

Campos que **se editam** no lugar:

| Campo | Observação |
|---|---|
| **Número** | Só informativo: não mexe no pino nem na poligonal. Se for diferente dos números de porta dos SQLs do terreno, aparece **"Número diferente do cadastro da prefeitura"** ("O número informado diverge dos números cadastrados no município para os lotes selecionados"), com **Cancelar** e **"Alterar mesmo assim"**. |
| **Complemento** | Texto livre. |
| **Zona** | Norte, Sul, Leste, Oeste, Centro, Sudeste, Sudoeste, Nordeste, Noroeste. |
| **Cartório de registro de imóveis** | Em São Paulo vem do GeoSampa e aparece marcado "do GeoSampa". Se você trocar, vale o que você escolheu, e o GeoSampa não sobrescreve mais. |
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
| **Telefone** | Com DDD (10 ou 11 dígitos). |
| **E-mail** | Precisa ser válido. |
| **CPF/CNPJ** | 11 dígitos (CPF) ou 14 (CNPJ). |
| **% de participação** | Só para quem é Proprietário; de 0 a 100%. |
| **Relação** | Proprietário, Cônjuge, Representante, Procurador, Parente, Contato ou Outros. |

**Dica:** cadastre também o procurador e o contato do dia a dia, não só os donos. Quem é proprietário conta para o item "Proprietário" da completude.

### Excluir uma parte (lixeira)

A lixeira exclui a parte. As matrículas e SQLs dela voltam a ficar soltos.

## Matrículas e SQLs

**Para que serve:** ligar o terreno aos documentos (matrícula no cartório) e aos lotes da prefeitura (SQL ou inscrição), e dizer de qual parte é cada um.

O quadro tem duas metades:

- **Matrículas**: digite o **Nº da matrícula**, confira o **Cartório** (já vem preenchido) e a **Área registrada**, e clique em **Incluir**. Vira uma etiqueta **amarela**.
- **SQLs** (ou o nome da inscrição na sua cidade): digite e clique em **Incluir**, ou use **"Escolher no mapa"**. Vira uma etiqueta **roxa**.

Cada etiqueta mostra o número e um **x**. Em tela estreita, as duas metades ficam uma sobre a outra e cada uma recolhe pela seta.

Embaixo vem **um quadro por parte**, numa grade, com a seta que abre e fecha a linha inteira.

### Levar as etiquetas para as partes

**Arraste** a etiqueta da área de cima para o quadro da parte, ou de uma parte para outra.

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
- **Valor venal e IPTU**: **"Lançar IPTU"** (ou "Atualizar IPTU") com Exercício, Venal terreno, Venal construção, Situação (Tributado ou Isento), IPTU anual, Parcelas e Fonte ("Carnê, certidão de dados cadastrais...").

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

Cinco cartões de área, cada um com sua fonte:

| Cartão | De onde vem |
|---|---|
| **Documental** | Digitada (da matrícula). |
| **Cadastral** | Em São Paulo, não se digita: é a soma das áreas dos SQLs do terreno (só quando todos têm área), refeita a cada SQL incluído, excluído ou consultado; uma área digitada antes volta para a soma ao abrir a ficha. Nas outras cidades, digitada. |
| **Levantamento** | Digitada (levantamento topográfico). **Ao digitar, vira a área adotada** (pode trocar depois). |
| **Estimativa** | Digitada. |
| **Poligonal** | Calculada pelo desenho, em m² inteiros. Nunca se digita. Muda quando a poligonal é ajustada. |

**Área adotada:** clique num cartão preenchido para escolhê-lo ("Clique na área que vale"). A adotada fica em azul com "Área adotada". Se a adotada é a Poligonal, ela acompanha cada ajuste do desenho.

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

## O que não é possível na aba Terreno

- Digitar CEP, logradouro, bairro e município (só pelo mapa).
- Em São Paulo, digitar a testada (vem da medição pela poligonal) e a área cadastral (soma dos SQLs).
- Características físicas (formato, ocupação, demolição) e confrontações de divisa: **saíram da ficha** por decisão. As frentes voltaram, medidas pela poligonal (acima).
- A seção antiga "Proprietários e contatos": foi para dentro das partes.
- Buscar o GeoSampa num computador de desenvolvimento (só na versão publicada).
- Arrastar etiquetas no celular sem segurar antes (o celular ainda não foi revisado).
