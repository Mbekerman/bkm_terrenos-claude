# 06. Ficha: aba Comercial

**Disponível.** Ficha › aba **Comercial** (endereço `/terrenos/A123/comercial`).

## Para que serve

Acompanhar a compra do terreno: o que o vendedor pede, quem trouxe o terreno, as propostas trocadas e as reuniões. Os quadros, nesta ordem: **Negociação**, **Condições pedidas** (com o valor de cada parte), **Propostas**, **Reuniões** e **Ofertas** (o corretor fica dentro de cada oferta).

**Regra:** a negociação só existe depois da **primeira oferta**. Terreno sem oferta está em **Backlog**: registre uma oferta para começar.

## Negociação

Resumo de onde a negociação está:

- **Situação** (Ativo, Stand By, Perdido, Descartado, Comprado), a subetapa com os dias nela e o motivo, quando há;
- **Temperatura** (a mesma do topo; pode mudar aqui);
- **Última proposta**;
- **Próxima reunião**.

Para mover a negociação (avançar, Stand By, Perdido...), use o quadro de avanço no painel. Ver [09](09-avanco-e-logs.md).

## Condições pedidas

Mostra o que o vendedor pede, na **oferta de referência** (a primeira, até alguém escolher outra em Ofertas recebidas), e quanto cada parte pede. Tudo se edita no lugar e grava na própria oferta.

**O valor pedido é sempre o de cada parte.** O total não se digita: os blocos do alto são o resumo das partes.

- **Valor total** (com uma parte só, **Valor pedido**): a soma dos valores das partes.
- **Por m²**: o valor total ÷ a área **só das partes que já têm valor** (com uma parte só, a área adotada do terreno). Enquanto falta alguma parte, embaixo aparece "sobre N m² com valor".

O número diminui de tamanho quando não cabe no bloco, até valores de R$ 999 milhões. Em tela estreita (celular), os dois blocos ficam um embaixo do outro.

Com duas ou mais partes, se alguma ainda não tem valor, aparece logo abaixo dos blocos o aviso amarelo **"Falta o valor pedido de Vendedor 3."** (ou "das partes …" quando são várias).

O corretor fica em cada oferta (ver Ofertas recebidas); Aceita permuta e Pagamento saíram deste quadro.

Embaixo, uma linha por parte (ver [05](05-ficha-terreno.md#partes)), com:

- as **matrículas da parte**, em etiquetas amarelas com a mini pizza do percentual (os SQLs não aparecem na linha). A etiqueta não se tira daqui; o clique abre a janela da matrícula, com a área registrada, o percentual da parte, a área da parte nela e os SQLs (ou inscrições) que estão dentro dela, cada um com a área do lote, o % da parte e a área da parte;
- a **área da parte** (pelos SQLs; sem eles, pelas matrículas). Com uma parte só, é a área adotada do terreno. Logo abaixo, em cinza claro, o zoneamento dos SQLs da parte;
- o **valor pedido** e o **valor por m²**, que se calculam um pelo outro (digite um e o outro muda). Aceita "12 mi" e precisa ser maior que zero;
- a **condição de pagamento**: Dinheiro, Permuta física, Permuta financeira, Permuta geral ou Permuta com torna;
- **Informações gerais**, no fim de cada parte: um texto livre para o que aquele vendedor pediu (permuta, entrada, prazos). Vale para a parte naquela oferta: outra oferta tem o seu próprio texto, porque as partes podem mudar de uma oferta para outra. Não é o texto da oferta (as impressões sobre o corretor e a firmeza ficam no card da oferta). Grava ao sair do campo.
No celular, a área e o valor por m² ficam lado a lado, e o valor pedido e a condição de pagamento ocupam a linha inteira.

Com duas ou mais partes, embaixo vem o **Total**, com "(faltam N)" enquanto alguma parte não tem valor.

**Valor antigo para o terreno inteiro:** se a oferta foi registrada com um valor só antes de existir o valor por parte, os blocos mostram esse valor com o aviso "O valor de R$ … foi registrado para o terreno inteiro. Informe o valor de cada parte abaixo". Quando a primeira parte ganha valor, o total passa a ser a soma das partes.

## Propostas

**Para que serve:** registrar cada valor que a BKM propõe e cada contraproposta do vendedor, com o histórico das versões.

**Como registrar:**

1. Clique em **"Nova proposta"**.
2. Preencha:
   - **Origem**: **BKM** (a BKM propõe) ou **Vendedor** (contraproposta);
   - **Valor total**;
   - **Forma de pagamento**;
   - **Status**: Apresentada, Em análise ou Rascunho;
   - **Partes da proposta**: para qual parte (dono) a proposta é feita. Pode ser uma, várias ou todas (**"Marcar todas"**, com três partes ou mais). Se o terreno tem **uma parte só**, ela já vem marcada; com **duas ou mais**, nenhuma vem marcada e o sistema **não deixa registrar** sem escolher pelo menos uma: o campo fica vermelho com o aviso "Escolha pelo menos uma parte". Logo abaixo das partes aparece a **área total da proposta**, que se refaz a cada parte marcada ou desmarcada: a soma das áreas das partes escolhidas (a mesma área que cada parte mostra no quadro Partes; com uma parte só, a área adotada do terreno), quantas partes de quantas e, com o valor total digitado, o valor por m². Parte sem área fica fora da soma e é citada embaixo ("Sem área: …"). As partes são as cadastradas na aba Terreno;
   - **Apresentada em** (data) e **Validade** (vem com 15 dias depois);
   - **Condições de pagamento** (texto).
3. Clique em **Registrar**.
4. O valor pedido e a forma de pagamento de cada parte se preenchem em **Condições pedidas**.

**Na lista**, cada proposta mostra as partes a que foi feita, em etiquetas logo abaixo do valor. Proposta registrada antes de 9/nov/2026 num terreno com duas ou mais partes aparece com **"Parte não informada"** (conta como de todas as partes). Parte que foi tirada do terreno aparece com "(saiu)".

**Versões:** cada proposta ganha um número (v1, v2, v3...), numa sequência só para o terreno.

**Nenhuma proposta mexe em outra.** Registrar uma proposta nova não recusa nem substitui as que estão em aberto, mesmo que sejam das mesmas partes. Em vez disso:

- no formulário, ao escolher uma parte que já tem proposta em aberto (Rascunho, Apresentada ou Em análise), aparece o aviso "Já há proposta em aberto para …";
- no quadro, enquanto houver duas ou mais propostas em aberto com uma parte em comum, aparece o alerta **"Propostas em aberto para a mesma parte"**, com as versões e as partes.

Você decide o que fazer: mudar o status de uma delas, excluir uma ou deixar as duas abertas. Nos resumos do terreno (Última proposta, filtros, Pipeline) vale a **mais recente**.

**Mudar o status de uma proposta:** clique no chip do status de **qualquer** proposta da lista e escolha: Rascunho, Apresentada, Em análise, Aceita, Recusada, Expirada, Retirada ou Substituída.

**Excluir uma proposta:** clique na lixeira ao lado do status e confirme. Ela sai da lista; o registro da exclusão fica nos Logs. Proposta com documento anexado não se exclui (mude o status).

**Regra:** proposta não se edita: para corrigir valor ou condição, registre outra e exclua ou mude o status da antiga. Tudo fica nos Logs.

## Reuniões

**Para que serve:** registrar as conversas com o vendedor, corretor ou advogado, o que foi falado e o que ficou combinado.

**Como registrar:**

1. Clique em **"Registrar reunião"**.
2. Escolha **Realizada** ou **Agendada**.
3. Preencha: data e hora, **Presencial** ou **Online**, **Na BKM** ou **Externa** (com o endereço: "Escritório do vendedor, no terreno..."), **Link da reunião** (só na Online, digitado: cole o endereço do Meet, Zoom ou Teams; sem "https://", o sistema completa), **Participantes da BKM**, **Participantes externos**, **Pauta**, **O que foi tratado** ("Posições de cada lado, valores citados, objeções") e **Encaminhamentos** ("Quem faz o quê, até quando").
4. Clique em **Registrar reunião**.

**Participantes com @:**

- **Participantes da BKM:** digite **@** e parte do nome (sem acento, em qualquer ordem de letras) e escolha na lista com as setas e **Enter**, ou com o clique. Você já vem marcado. Cada colega marcado recebe um aviso no sino ("Fulano marcou você na reunião de 25/11 às 10:00"), que abre a reunião. Quem já foi citado com @ no texto da mesma reunião não recebe aviso repetido.
- **Participantes externos:** a lista traz as pessoas **de fora cadastradas neste terreno que têm e-mail**: as pessoas das partes (proprietário, cônjuge, procurador...), os corretores do terreno e o contato principal de cada parte. Quem não está na lista entra pelo nome: digite e tecle **Enter** (ou vírgula). Marcar alguém de fora **só registra** a pessoa como participante: o sistema ainda não manda e-mail nem convite para ela.
- Para tirar alguém, clique no **×** do nome (ou **Backspace** com o campo vazio).
- Na **Pauta**, em **O que foi tratado** e em **Encaminhamentos**, digitar **@** abre a lista dos colegas; o @ escolhido entra no texto, aparece destacado e avisa a pessoa no sino.

Na lista, a reunião online com link mostra **"Entrar na reunião"** (agendada) ou **"Link da reunião"** (realizada), que abrem o link numa aba nova.

**Editar:** clique na reunião (ou no lápis ao lado da situação). O formulário abre no lugar dela, com tudo o que foi gravado; mude o que precisar, inclusive os participantes e a situação (Agendada, Realizada ou **Cancelada**), e clique em **Salvar**. Cada mudança fica nos Logs ("Reunião alterada: ...", "Participante incluído na reunião de ...", "Participante tirado da reunião de ..."). Quem tem perfil Leitura só vê.

**Observações das ofertas (diretor):** o diretor vê, embaixo da lista, as observações de todas as ofertas do terreno juntas, da mais nova para a mais antiga, com o número, a data e o selo da ativa. Embaixo das informações gerais de cada oferta vêm as informações gerais da pedida de cada parte, com o nome da parte.

Uma reunião **Agendada** ganha o botão **"Marcar realizada"** quando acontece.

**Regra:** reunião realizada não pode ter data futura.

## Ofertas

**Para que serve:** guardar cada oferta que chega, inclusive o mesmo terreno oferecido por outro corretor ou por outro valor. O cadastro do terreno já é a primeira oferta.

A lista mostra, para cada oferta: o número (**A112-1**, **A112-2**...), se é a **Ativa** ou **Não ativa**, a data, a **área cadastral** do terreno e o **corretor** (todos, um por linha, quando há mais de um).

**Card da oferta:** o **ⓘ** no fim da linha abre o card com a **data da oferta**, os **corretores** (o primeiro é o principal; **x** tira um e **Adicionar corretor** põe outro, inclusive "+ Novo corretor..."), os **lotes** (cada SQL ou inscrição com a área cadastral e a **área total**) e as **observações**. Data, corretores e observações gravam na hora, sem botão de salvar. Os lotes não se editam no card: acompanham os SQLs incluídos ou tirados na aba Terreno. Leitura só vê.

**Oferta ativa:** o terreno tem uma só oferta ativa, marcada com o selo **"Oferta ativa"**; as Condições pedidas mostram as dela. O responsável pelo terreno ou o diretor troca em **"Marcar como ativa"**.

**Oferta aguardando:** quando outra pessoa cadastrou o mesmo imóvel enquanto a tratativa estava em andamento, a oferta dela fica **"Aguardando"**, vista só por quem a registrou e pelo diretor. Quando a tratativa vence, aparece **"Assumir"**: a oferta vira a ativa, quem assumiu vira o responsável e o anterior é avisado.

**Como registrar uma oferta:**

1. Clique em **"Registrar oferta"**.
2. Preencha só o **Corretor** (escolha um dos cadastrados, **"Sem corretor / direto"** ou **"+ Novo corretor..."**) e, se quiser, a **Observação sobre a oferta** (texto livre). A oferta entra com a data de hoje, que se troca no card.
3. Clique em **Registrar**.

**Dica:** o "Valor pedido na entrada" do Resumo é sempre a **primeira** oferta, para comparar com o que veio depois.

### Novo corretor

Em qualquer lista de corretor, **"+ Novo corretor..."** abre o cadastro: **Nome**, **E-mail** e **Celular** são obrigatórios (celular com DDD); **Apelido**, CPF, RG, Creci, Nome da imobiliária, Creci jurídico, CNPJ e Endereço são opcionais. Cadastrado, ele já fica escolhido. Leitura não cadastra corretor. Na lista, o corretor aparece como "Nome (Apelido)".

## Avisos

Ofertas, propostas e reuniões geram aviso no sino de quem acompanha o terreno, e o clique no aviso abre esta aba.

## O que não é possível na aba Comercial hoje

- **Ainda não disponível:** criar a reunião no Google Agenda, convidar os participantes por e-mail, gerar o link do Meet sozinho e receber a gravação e o resumo do Gemini. Hoje a reunião fica só no sistema: o link é digitado e o participante de fora só fica registrado.
- **Ainda não disponível:** o quadro de negociação separada por parte (cada parte com sua própria etapa, propostas e botão de avançar).
- **Ainda não disponível:** a próxima tarefa no quadro Negociação (entra com as tarefas).
- **Ainda não disponível:** o aviso "Rentabilidade abaixo da mínima" (depende do estudo de viabilidade).
- Apagar uma oferta ou proposta: não existe, de propósito. Use os status (Retirada, Expirada) para tirar de cena.
