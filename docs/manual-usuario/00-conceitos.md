# 00. Conceitos do sistema

Leia esta seção antes das outras. Ela explica as palavras que o sistema usa e como as coisas se ligam. Quem entende estes conceitos acha o resto sozinho.

## Para que serve o BKM Terrenos

O BKM Terrenos guarda cada terreno que chega à BKM, desde a primeira oferta até a entrega da obra, e mostra em que ponto cada um está. Ele substitui a planilha de Excel onde os terrenos ficam hoje. Na primeira versão, o foco é a fase de **Novos Negócios**: cadastrar o terreno, juntar os dados (endereço, matrículas, SQLs, áreas, zoneamento, entorno), registrar ofertas e propostas e mover a negociação pelas etapas até comprar, perder ou descartar.

## Terreno, oferta e negociação são coisas diferentes

Esta é a ideia mais importante do sistema.

| Palavra | O que é | Exemplo |
|---|---|---|
| **Terreno** | A área estudada, desenhada no mapa (a poligonal). Tem um código (A001, A002...) e um nome de referência. | "Vila Mariana - Domingos de Morais", código A123. |
| **Oferta** | Alguém oferecendo o terreno (ou parte dele) à BKM, com um valor pedido e uma forma de pagamento. Um terreno pode ter várias ofertas ao longo do tempo, de corretores diferentes. | O corretor João oferece por R$ 12 milhões em dinheiro. |
| **Negociação** | O andamento da BKM com aquele terreno na fase de Novos Negócios: etapa, subetapa, propostas. Abre com a primeira oferta. | Está na etapa "Estudos Preliminares", subetapa "Estudo de Massa", temperatura Quente. |
| **Proposta** | Um valor e condições que a BKM apresenta ao vendedor, ou que o vendedor devolve. Cada resposta vira uma nova versão (v1, v2...). | BKM propõe R$ 10 milhões, vendedor contrapropõe R$ 11,5 milhões. |

**Regra:** as condições pedidas (valor, forma de pagamento, aceita permuta) pertencem à **oferta**. A ficha mostra a oferta "de referência" (a primeira, até alguém escolher outra). A **temperatura** pertence ao **terreno**: dá para avaliar mesmo antes da primeira oferta.

## Fase, etapa e subetapa

O caminho de um terreno é dividido em três níveis:

- **Fase**: o grande momento da vida do terreno. São oito: Novos Negócios, Aprovação de Projetos, Registro de Incorporação, Funding, Contratação Caixa, Lançamento, Obras e Entregue. Cada fase é um processo próprio, com etapas, situação e histórico. Uma fase só abre quando as anteriores de que ela depende se cumprem (Funding é a exceção: abre à mão e não trava outra fase). Duas fases podem correr ao mesmo tempo.
- **Etapa**: um passo dentro da fase. Cada etapa tem um prazo (SLA).
- **Subetapa**: um passo dentro da etapa. Também tem prazo.

No padrão do sistema, Novos Negócios tem quatro etapas, cada uma com suas subetapas:

| Etapa | Prazo padrão | Subetapas |
|---|---|---|
| Em Triagem | 10 dias | Aguardando Informações, Aguardando Documentos, Verificação Interna |
| Estudos Preliminares | 20 dias | Estudo de Massa, Estudo de Viabilidade, Análise Técnica Preliminar |
| Negociação | 60 dias | Aguardando Primeira Reunião, Preparando Proposta, Proposta Enviada, Contra Proposta |
| Contrato | 30 dias (entrar nela pede aprovação do gestor) | Em Elaboração, Contrato Enviado, Em Ajuste |

Esses nomes e prazos são o padrão de fábrica. O administrador pode mudá-los (hoje, direto no banco, porque a tela de Configurações ainda não está no sistema real); se a tela mostrar outro nome, vale a tela.

**Situação** (ou status) de uma fase: **Ativo** (andando), **Stand By** (parado de propósito, com data para retomar), **Perdido** (o terreno foi para outro comprador ou o vendedor desistiu), **Descartado** (a BKM desistiu) e **Concluído**, que em Novos Negócios se chama **Comprado**.

**Backlog** é o terreno que existe no sistema mas ainda não tem negociação (nenhuma oferta registrada).

## Partes

Quando um terreno tem vários donos que negociam separado (por exemplo, três irmãos, cada um com sua matrícula, cada um com seu preço), o terreno é dividido em **partes**. Todo terreno nasce com uma parte chamada "Vendedor 1". Com duas ou mais partes, cada parte pode ter seu valor pedido, sua condição de pagamento e, a partir da etapa de divisão, sua própria negociação. O terreno só fica Comprado quando todas as partes ativas estão compradas.

Um dono com várias matrículas continua sendo **uma parte só**.

## Matrícula e SQL

- **Matrícula**: o registro do imóvel no cartório de registro de imóveis. No sistema aparece como uma etiqueta **amarela** com o número.
- **SQL** (em São Paulo) ou **inscrição imobiliária** (em outras cidades): o número do lote no cadastro da prefeitura, o mesmo do IPTU. No sistema aparece como etiqueta **roxa**.

Em São Paulo, o sistema consulta cada SQL no **GeoSampa** (o mapa oficial da prefeitura) e traz o lote, a área, o zoneamento e as restrições. Em São José dos Campos, o equivalente é o **GeoSanja**.

**Regra:** a mesma matrícula ou o mesmo SQL não entram em dois terrenos diferentes. Se a pessoa tentar, o sistema pergunta se ela quer abrir o outro terreno ou registrar uma nova oferta nele.

## Poligonal e pino

- **Poligonal**: o desenho do contorno do terreno no mapa. Todo terreno começa por ela. É dela que o sistema tira o município, o endereço, o cartório e a área.
- **Pino**: o ponto do terreno no mapa, normalmente no centro da poligonal.

## Áreas

O terreno pode ter até cinco áreas, de fontes diferentes: **Documental** (da matrícula), **Cadastral** (da prefeitura, soma dos SQLs), **Levantamento** (topográfico), **Estimativa** e **Poligonal** (calculada pelo desenho). A pessoa escolhe uma delas como **área adotada**, que é a usada nas contas (valor por m², por exemplo).

## Papéis das pessoas

O papel vem do cadastro da pessoa, não de uma escolha na tela.

| Papel | O que faz |
|---|---|
| **Diretor** | Edita tudo, aprova o que pede diretor, avança etapa mesmo com pendência (com justificativa). |
| **Gestor** | Edita tudo, aprova o que pede gestor, avança etapa mesmo com pendência (com justificativa). |
| **Analista** | Cadastra e edita terrenos, registra ofertas e propostas, avança etapa quando não há pendência, pede aprovação. |
| **Leitura** | Só consulta. Não vê lápis, lixeiras nem botões de registrar. |
| **Básico** | Quem entrou pelo Google com e-mail da BKM e ainda não foi promovido. Por ora, igual a Leitura. |

**Administrador** é uma permissão à parte (equipe e configurações), que hoje Moises e Rafael têm.

Há hierarquia: analista responde a um gestor, que responde a um diretor. Qualquer superior pode aprovar por quem está abaixo.

## Código do terreno

Cada terreno recebe sozinho um código de uma letra e três números, na ordem A001 ... A999, B001 ... Z999, sem as letras I e O (para não confundir com 1 e 0). O código é o jeito mais rápido de achar um terreno e aparece no endereço do navegador (`/terrenos/A123`).

## Glossário

| Termo | Significado no sistema |
|---|---|
| Acesso principal | A rua considerada a frente do terreno, escolhida no cadastro quando há mais de uma. |
| Área adotada | A área escolhida entre as cinco fontes para as contas. |
| Backlog | Terreno sem negociação. |
| Cartório | Cartório de registro de imóveis da região do terreno. Em São Paulo vem do GeoSampa. |
| CA | Coeficiente de aproveitamento: quantas vezes a área do terreno se pode construir. |
| Completude | Quanto da ficha está preenchido ("Ficha 75% completa"). |
| Concorrência | Empreendimentos de outras empresas, vindos do monitor de mercado (Órulo). |
| Etiqueta | O quadradinho de uma matrícula (amarela) ou de um SQL (roxa) na aba Terreno. |
| Faixa (renda) | Intervalo de renda familiar usado nas cores do Mapa de Renda. |
| Gaveta | Painel que desliza sobre a tela (a ficha no mapa, os filtros). |
| GeoSampa / GeoSanja | Mapas oficiais das prefeituras de São Paulo e São José dos Campos. |
| HIS / HMP | Habitação de Interesse Social e Habitação de Mercado Popular, tipos de empreendimento com regras próprias de zoneamento. |
| Logs | Histórico de tudo que mudou no terreno, com data, hora e pessoa. |
| MCMV | Minha Casa, Minha Vida. |
| Oferta de referência | A oferta cujas condições a ficha mostra. |
| Parte | Um grupo de donos que negocia separado. |
| Pendência | Algo que falta para a negociação avançar de etapa. |
| Poligonal | O contorno do terreno desenhado no mapa. |
| SLA | Prazo de uma etapa ou subetapa. |
| SQL | Número do lote na prefeitura de São Paulo. |
| Stand By | Negociação parada de propósito, com data para retomar. |
| Temperatura | O quanto o terreno está promissor para a BKM (com ou sem negociação): Muito fria, Fria, Morna, Quente, Muito quente. |
| VGV | Valor Geral de Vendas: soma do preço de todas as unidades do empreendimento. |
| VSO | Velocidade de vendas: vendidas ÷ (vendidas + à venda) no período. |
| Zoneamento | A zona da lei de uso do solo onde o terreno fica (ZC, ZM, ZEU...). |
